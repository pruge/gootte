import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { commitMessagesInRange, originMainSha } from "./git";
import { defaultPlanDataDir } from "./plan-store";

/**
 * 신관례(`tickets/T<NN>.md`) 티켓 완료를 `origin/main` git 히스토리에서 파생하는 리졸버(T01).
 *
 * 🔴 `core-io` 에 둔다 — git 헬퍼(`git.ts`)를 쓰므로 layering 상 위층(core) 이 아니라 여기다.
 * 그래서 `core` 는 이 함수를 직접 안 부르고, backend(T02/T04)가 이걸 불러 `applyBacklogStatus`
 * 같은 core 순수 함수에 **입력으로 넘긴다**(core-io → core 단방향 유지, 순환 의존 없음).
 *
 * 🔴 읽기 전용(INV-2) — 관리대상에 한 글자도 안 쓴다. done-집합은 gootte 자기 저장소
 * (`dataDir`, 영구 스냅샷과 같은 수명)에만 캐시한다. 판정은 결정적·LLM-free(INV-4).
 *
 * 🔴 캐시는 **per-repo**(clone 경로 기준) — git 히스토리는 repo 별이므로. 전역 1슬롯이었을 때
 * (a) 다중 repo 에서 SHA 슬롯이 덮어씌워져 매 tick 전체 재스캔(게이트 파괴), (b) A repo 의
 * `T05` 가 B repo 판정까지 오염(교차 프로젝트 충돌) 하는 결함이 있었다. repo 키로 격리하면 둘 다
 * 사라진다. 같은 repo 를 여러 곳에 clone 해도 SHA·토큰이 같아 각 항목이 동일해질 뿐 오판은 없다.
 *
 * 🔴 **slug 범위(T06)** — `done` 은 `done[repo][slug][num]` 이다. `T<NN>` 토큰만으로 매칭하면
 * 다른 기능의 같은 번호 티켓까지 오탐 완료된다(기획 문서 커밋 "tickets T01-T03", 교차 참조 등).
 * 커밋 메시지에서 feature slug 와 `T<NN>` 이 **같이** 나올 때만 그 slug 아래에 기록한다 — slug 를
 * 못 뽑으면(예: slug 없이 `T01` 단독 언급, trailer 만 있는 `Closes: T08`) 기록하지 않는다
 * (안전 쪽 오류: 오탐보다 미탐, T06 locked decision).
 */

const CACHE_FILE = "ticket-git-status.json";
// 🔴 캐시 스키마 버전 — v1(`done[repo][num]`, slug 미반영)은 T06 에서 v2(`done[repo][slug][num]`)로
// 교체됐다. 버전이 다르면 무효화해 구형 캐시가 새 구조로 오해석되지 않게 한다.
const CACHE_VERSION = 2;

interface TicketGitCache {
  version: number;
  /** repo(Clone 경로)별로 본 마지막 `origin/main` SHA — 바뀌면 그 repo 만 증분 재검증(grill D2). */
  shas: Record<string, string | null>;
  /** repo → slug → `T<NN>` 토큰 집합(`done[repo][slug]["05"]`, T06). */
  done: Record<string, Record<string, Record<string, true>>>;
}

// `T<NN>` 토큰 — 대소문자 구분 안 함. 제목·본문·trailer 모두에서 본다(grill D3).
const TICKET_TOKEN = /\bT(\d{1,3})\b/gi;

// conventional-commit scope — `feat(<slug>): ...` 형태의 제목 줄에서 slug 를 뽑는다(T06).
const SCOPE_SLUG = /^\s*[\w.]+\(([\w-]+)\)\s*:/gm;
// 선택적 trailer — `Ticket: <slug>` / `Feature: <slug>` / `Scope: <slug>` 형태(T06 locked decision).
const TRAILER_SLUG = /^(?:Ticket|Feature|Scope):\s*([\w-]+)/gim;

/** 커밋 메시지에서 feature slug 후보를 뽑는다 — 없으면 빈 Set(안전 쪽 오류로 이어진다). */
function extractSlugs(message: string): Set<string> {
  const slugs = new Set<string>();
  for (const m of message.matchAll(SCOPE_SLUG)) slugs.add(m[1]!);
  for (const m of message.matchAll(TRAILER_SLUG)) slugs.add(m[1]!);
  return slugs;
}

function cachePath(dataDir: string): string {
  return join(dataDir, CACHE_FILE);
}

function readCache(dataDir: string): TicketGitCache | null {
  try {
    const parsed = JSON.parse(readFileSync(cachePath(dataDir), "utf8")) as Partial<TicketGitCache>;
    // 🔴 버전 없거나 다르면 무효 — v1(`done[repo][num]`) 등 구형 구조가 새 구조로 오해석되지 않게.
    if (parsed.version !== CACHE_VERSION) return null;
    if (typeof parsed.shas !== "object" || parsed.shas === null) return null;
    if (typeof parsed.done !== "object" || parsed.done === null) return null;
    return {
      version: CACHE_VERSION,
      shas: parsed.shas as Record<string, string | null>,
      done: parsed.done as Record<string, Record<string, Record<string, true>>>,
    };
  } catch {
    return null;
  }
}

function writeCache(dataDir: string, cache: TicketGitCache): void {
  try {
    writeFileSync(cachePath(dataDir), JSON.stringify(cache));
  } catch {
    // 저장 실패는 치명하지 않다 — 다음 호출이 다시 시도한다
  }
}

/**
 * `origin/main` 이 움직였을 때만 **그 repo** 의 done-집합을 갱신한다(grill D2 — 매 기동 전체 훑기
 * 금지, 다중 repo 에서도 각자 게이트). SHA 가 같으면 `git log` 를 호출하지 않는다(캐시 히트,
 * T01 허용기준). `origin/main` 을 못 읽으면 그 repo 항목을 건드리지 않고 false(대시보드 안전).
 *
 * SHA 가 바뀌면 **증분** 스캔 — `git log <lastSha>..origin/main` 만 본다(비용 = push 당 새 커밋 수).
 * 캐시가 없으면 처음 한 번 전체(`origin/main`)를 훑는다.
 *
 * 🔴 반환값 — 이번 호출에 이 repo 캐시를 갱신했으면 `true`(SHA 변경 → 재스캔), 아니면 `false`
 * (캐시 히트 or origin/main 못 읽음). 재검증기(T02)가 "화면에 알릴까" 결정하는 데 쓴다.
 */
export function revalidateTicketGitStatus(repo: string, dataDir: string = defaultPlanDataDir()): boolean {
  const sha = originMainSha(repo);
  if (sha === null) return false; // origin/main 못 읽음 → 이 repo 항목 안 건드림
  const prev = readCache(dataDir);
  const cachedSha = prev?.shas[repo] ?? null;
  if (cachedSha === sha) return false; // 이 repo 캐시 히트, git log 0회
  const range = cachedSha ? `${cachedSha}..origin/main` : "origin/main";
  // slug 별로 얕은 복사 — 다른 slug 항목을 안 건드리고 이번 스캔분만 갱신한다.
  const repoDone: Record<string, Record<string, true>> = {};
  for (const [slug, nums] of Object.entries(prev?.done[repo] ?? {})) repoDone[slug] = { ...nums };
  for (const line of commitMessagesInRange(repo, range)) {
    const message = line.includes("\x1f") ? line.slice(line.indexOf("\x1f") + 1) : line;
    const slugs = extractSlugs(message);
    if (slugs.size === 0) continue; // slug 없이 T<NN> 만 나오면 무시(안전 쪽 오류, T06)
    for (const m of message.matchAll(TICKET_TOKEN)) {
      const num = m[1]!;
      for (const slug of slugs) {
        repoDone[slug] ??= {};
        repoDone[slug][num] = true;
      }
    }
  }
  const shas = { ...(prev?.shas ?? {}), [repo]: sha };
  const done = { ...(prev?.done ?? {}), [repo]: repoDone };
  writeCache(dataDir, { version: CACHE_VERSION, shas, done });
  return true;
}

/**
 * `(repo, slug, num)` 티켓이 `origin/main` 에 착지했는가 — 그 repo 의 커밋 메시지에 `T<NN>` 토큰이
 * reachable 하면 true(ticket-done-from-git T01, grill D1/D3).
 *
 * 🔴 `slug` 는 이제 판정에 쓰인다(T06) — 커밋 메시지에 이 slug 와 `T<NN>` 이 같이 나온 커밋만
 * 완료로 친다(`done[repo][slug][num]`). repo 로도 격리된다(다른 repo 의 토큰은 안 섞임).
 * `origin/main` 을 못 읽으면 false(예외 대신, 대시보드 안전). 매 호출이 `revalidateTicketGitStatus`
 * 를 거쳐 SHA 게이트를 지키므로, SHA 불변 시 git 작업은 `rev-parse` 한 번뿐이다.
 */
export function resolveTicketDone(
  repo: string,
  slug: string,
  num: string,
  dataDir: string = defaultPlanDataDir(),
): boolean {
  revalidateTicketGitStatus(repo, dataDir);
  const cache = readCache(dataDir);
  return cache ? cache.done[repo]?.[slug]?.[num] === true : false;
}

/** 테스트/디버그용 — 캐시 파일이 실제로 쓰였는지 확인한다. */
export function ticketGitCacheExists(dataDir: string): boolean {
  return existsSync(cachePath(dataDir));
}
