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
 */

const CACHE_FILE = "ticket-git-status.json";

/**
 * 캐시 포맷 버전 — v2: 완료 시점(`doneAt`)과 소요시간(`elapsed`) 저장 추가(a-ticket-tells-how-long-it-took).
 * v1 캐시는 자동 무효화되어 전체 재스캔한다.
 */
export const TICKET_GIT_CACHE_VERSION = 2;

interface TicketDoneInfo {
  doneAt: string;      // ISO 8601 (예: 2026-08-26T12:23:00+09:00)
  elapsed?: string;    // 인간 읽기 가능 문구 (예: "2시간 13분")
}

interface TicketGitCache {
  version: number;
  /** repo(Clone 경로)별로 본 마지막 `origin/main` SHA — 바뀌면 그 repo 만 증분 재검증(grill D2). */
  shas: Record<string, string | null>;
  /** repo별 `T<NN>` 토큰 정보 — `done[repo]["05"] = { doneAt, elapsed }` */
  done: Record<string, Record<string, TicketDoneInfo>>;
}

// `T<NN>` 토큰 — 대소문자 구분 안 함. 제목·본문·trailer 모두에서 본다(grill D3).
const TICKET_TOKEN = /\bT(\d{1,3})\b/gi;

function cachePath(dataDir: string): string {
  return join(dataDir, CACHE_FILE);
}

function readCache(dataDir: string): TicketGitCache | null {
  try {
    const parsed = JSON.parse(readFileSync(cachePath(dataDir), "utf8")) as Partial<TicketGitCache>;
    if (parsed.version !== TICKET_GIT_CACHE_VERSION) return null;
    if (typeof parsed.shas !== "object" || parsed.shas === null) return null;
    if (typeof parsed.done !== "object" || parsed.done === null) return null;
    return { version: parsed.version, shas: parsed.shas as Record<string, string | null>, done: parsed.done as Record<string, Record<string, TicketDoneInfo>> };
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
 * ISO 8601 문자열을 `YYYY-MM-DD HH:MM` 로 변환 (표시용).
 */
function formatDoneAt(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

/**
 * 두 시점 차이를 인간 읽기 가능 문구로 — a-ticket-tells-how-long-it-took.
 * 예: "3분", "1시간 23분", "2일 5시간"
 */
function formatElapsed(startIso: string, endIso: string): string {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (isNaN(start) || isNaN(end) || end < start) return "";
  const diffMs = end - start;
  const days = Math.floor(diffMs / 86400000);
  const hours = Math.floor((diffMs % 86400000) / 3600000);
  const minutes = Math.floor((diffMs % 3600000) / 60000);
  const parts: string[] = [];
  if (days) parts.push(`${days}일`);
  if (hours) parts.push(`${hours}시간`);
  if (minutes || parts.length === 0) parts.push(`${minutes}분`);
  return parts.join(" ");
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
  const repoDone: Record<string, TicketDoneInfo> = prev?.done[repo] ? { ...prev.done[repo] } : {};
  for (const line of commitMessagesInRange(repo, range)) {
    // format: hash\x1fdate\x1fmessage
    const parts = line.split("\x1f");
    if (parts.length < 3) continue;
    const commitDate = parts[1];
    if (!commitDate) continue;
    const message = parts[2] ?? "";
    for (const m of message.matchAll(TICKET_TOKEN)) {
      const num = m[1]!;
      // 기존 것보다 최신 커밋이면 갱신 (git log는 최신순이므로 첫 매칭이 최신)
      if (!repoDone[num]) {
        const prevDoneAt = prev?.done[repo]?.[num]?.doneAt as string | undefined;
        repoDone[num] = {
          doneAt: formatDoneAt(commitDate),
          elapsed: prevDoneAt ? formatElapsed(prevDoneAt, commitDate) : "",
        };
      }
    }
  }
  const shas = { ...(prev?.shas ?? {}), [repo]: sha };
  const done = { ...(prev?.done ?? {}), [repo]: repoDone };
  writeCache(dataDir, { version: TICKET_GIT_CACHE_VERSION, shas, done });
  return true;
}

/**
 * `(repo, slug, num)` 티켓이 `origin/main` 에 착지했는가 — 그 repo 의 커밋 메시지에 `T<NN>` 토큰이
 * reachable 하면 true(ticket-done-from-git T01, grill D1/D3).
 *
 * 🔴 `slug` 는 git 신호에 들어가지 않는다(grill D3 이 `T<NN>` 만 본다) — num 기준 판정이고, repo
 * 로 격리된다(다른 repo 의 토큰은 안 섞임). `origin/main` 을 못 읽으면 false(예외 대신, 대시보드
 * 안전). 매 호출이 `revalidateTicketGitStatus` 를 거쳐 SHA 게이트를 지키므로, SHA 불변 시 git 작업은
 * `rev-parse` 한 번뿐이다.
 */
export function resolveTicketDone(
  repo: string,
  slug: string,
  num: string,
  dataDir: string = defaultPlanDataDir(),
): boolean {
  revalidateTicketGitStatus(repo, dataDir);
  const cache = readCache(dataDir);
  return cache ? cache.done[repo]?.[num] !== undefined : false;
}

/**
 * 완료 티켓의 상세 정보 반환 (완료 시점, 소요시간) — 프론트엔드 표시용.
 */
export function resolveTicketDoneDetail(
  repo: string,
  slug: string,
  num: string,
  dataDir: string = defaultPlanDataDir(),
): TicketDoneInfo | null {
  revalidateTicketGitStatus(repo, dataDir);
  const cache = readCache(dataDir);
  return cache?.done[repo]?.[num] ?? null;
}

/** 테스트/디버그용 — 캐시 파일이 실제로 쓰였는지 확인한다. */
export function ticketGitCacheExists(dataDir: string): boolean {
  return existsSync(cachePath(dataDir));
}