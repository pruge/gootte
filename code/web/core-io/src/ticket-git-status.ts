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
 */

const CACHE_FILE = "ticket-git-status.json";

interface TicketGitCache {
  /** 마지막으로 본 `origin/main` SHA — 바뀌면 증분 재검증한다(grill D2). */
  originMainSha: string | null;
  /** `T<NN>` 토큰이 착지한 티켓 번호 집합(`"05"` → true). 🔴 slug 는 git 신호에 없다(grill D3). */
  done: Record<string, true>;
}

// `T<NN>` 토큰 — 대소문자 구분 안 함. 제목·본문·trailer 모두에서 본다(grill D3).
const TICKET_TOKEN = /\bT(\d{1,3})\b/gi;

function cachePath(dataDir: string): string {
  return join(dataDir, CACHE_FILE);
}

function readCache(dataDir: string): TicketGitCache | null {
  try {
    const parsed = JSON.parse(readFileSync(cachePath(dataDir), "utf8")) as Partial<TicketGitCache>;
    if (parsed.originMainSha !== null && typeof parsed.originMainSha !== "string") return null;
    if (typeof parsed.done !== "object" || parsed.done === null) return null;
    return { originMainSha: parsed.originMainSha ?? null, done: parsed.done as Record<string, true> };
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
 * `origin/main` 이 움직였을 때만 done-집합을 갱신한다(grill D2 — 매 기동 전체 훑기 금지).
 * SHA 가 같으면 `git log` 를 호출하지 않는다(캐시 히트, T01 허용기준). `origin/main` 을 못
 * 읽으면 캐시를 건드리지 않고 나간다(대시보드가 깨지지 않게, grill D1 안전 절).
 *
 * SHA 가 바뀌면 **증분** 스캔 — `git log <lastSha>..origin/main` 만 본다(비용 = push 당 새
 * 커밋 수). 캐시가 없으면 처음 한 번 전체(`origin/main`)를 훑는다.
 */
export function revalidateTicketGitStatus(repo: string, dataDir: string = defaultPlanDataDir()): void {
  const sha = originMainSha(repo);
  if (sha === null) return; // origin/main 못 읽음 → 캐시 안 건드림
  const prev = readCache(dataDir);
  if (prev && prev.originMainSha === sha) return; // 캐시 히트, git log 0회
  const range = prev ? `${prev.originMainSha}..origin/main` : "origin/main";
  const done: Record<string, true> = prev ? { ...prev.done } : {};
  for (const line of commitMessagesInRange(repo, range)) {
    const message = line.includes("\x1f") ? line.slice(line.indexOf("\x1f") + 1) : line;
    for (const m of message.matchAll(TICKET_TOKEN)) {
      done[m[1]!] = true;
    }
  }
  writeCache(dataDir, { originMainSha: sha, done });
}

/**
 * `(repo, slug, num)` 티켓이 `origin/main` 에 착지했는가 — 커밋 메시지에 `T<NN>` 토큰이
 * reachable 하면 true(ticket-done-from-git T01, grill D1/D3).
 *
 * 🔴 `slug` 는 git 신호에 들어가지 않는다(grill D3 이 `T<NN>` 만 본다) — num 기준 판정이다.
 * `origin/main` 을 못 읽으면 false(예외 대신, 대시보드 안전).
 * 매 호출이 `revalidateTicketGitStatus` 를 거쳐 SHA 게이트를 지키므로, SHA 불변 시 git 작업은
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
  return cache ? cache.done[num] === true : false;
}

/** 테스트/디버그용 — 캐시 파일이 실제로 쓰였는지 확인한다. */
export function ticketGitCacheExists(dataDir: string): boolean {
  return existsSync(cachePath(dataDir));
}
