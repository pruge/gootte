import { execFileSync } from "node:child_process";

/** IO 층 — git CLI 위임. 전부 읽기 전용(INV-2). */

function git(repo: string, args: string[]): string {
  // stderr 를 물려받지 않고 잡는다 — 못 읽는 사본의 `fatal:` 이 우리 출력에 섞이지 않게.
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function gitSafe(repo: string, args: string[]): string | null {
  try {
    return git(repo, args);
  } catch {
    return null;
  }
}

/**
 * HEAD 가 올라가 있는 브랜치. **detached HEAD 면 빈 문자열**, git 이 답하지 못하면 **null**.
 *
 * 🔴 실패를 빈 문자열로 접지 않는다. 접으면 "읽지 못했다" 가 "유휴다" 로 둔갑해
 * 실제로 돌고 있는 작업이 화면에서 조용히 사라진다 — 호출자가 그 둘을 구분해 다뤄야 한다.
 */
export function currentBranch(repo: string): string | null {
  return gitSafe(repo, ["branch", "--show-current"]);
}

/** 그 ref 가 이 저장소에서 해소되는가. */
export function revExists(repo: string, ref: string): boolean {
  return gitSafe(repo, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]) !== null;
}

/**
 * `<range>` 안의 커밋들이 건드린 경로 — 저장소 루트 기준, 중복 제거.
 * 순 diff 가 아니라 **커밋마다의 변경**이라 중간에 고쳤다 되돌린 파일도 잡힌다.
 */
export function commitTouchedFiles(repo: string, range: string): string[] {
  // `core.quotepath=false` — 끄지 않으면 비 ASCII 경로가 `\355\225\234` 로 이스케이프돼 나와
  // 경로 규칙이 그 파일을 못 알아본다(= 이을 수 있는 작업을 미상으로 흘린다).
  const out = gitSafe(repo, ["-c", "core.quotepath=false", "log", "--name-only", "--format=", range]);
  if (!out) return [];
  return [...new Set(out.split("\n").map((l) => l.trim()).filter(Boolean))];
}

/** 저장소인가 — `.git` 이 있으면 true, 아니면 false(저장소가 아닌 사본은 건너뛴다, T02). */
export function isRepo(repo: string): boolean {
  return gitSafe(repo, ["rev-parse", "--git-dir"]) !== null;
}

/** HEAD 가 가리키는 commit 해시. detached 도 해시로 답한다. 못 읽으면 null. */
export function headCommit(repo: string): string | null {
  return gitSafe(repo, ["rev-parse", "HEAD"]);
}

/**
 * `path`(repo 루트 기준)에 커밋 안 된 변경이 있는가 — `git status --porcelain -- <path>`.
 * 빈 출력이면 커밋 상태(false), 비었으면 미커밋(true). 못 읽으면 null(판정 불가).
 * 파일 하나만 묻는다 — 사본 전체를 훑지 않는다(T02 §구현 메모).
 */
export function hasUncommittedChange(repo: string, path: string): boolean | null {
  const out = gitSafe(repo, ["status", "--porcelain", "--", path]);
  if (out === null) return null;
  return out.trim().length > 0;
}

/**
 * `descendant` 가 `ancestor` 의 후손인가(조상 관계). `repo` 는 두 commit 을 모두 가진 저장소여야
 * 한다(T02 — 사본들이 객체를 공유하는 clone 관계라면 한쪽에 둘 다 있다). true: 조상, false: 아님,
 * null: 못 판정(git 이 답하지 않음). exit 1 = "조상 아님" 이지 오류가 아니다.
 */
export function isAncestor(repo: string, ancestor: string, descendant: string): boolean | null {
  try {
    execFileSync("git", ["-C", repo, "merge-base", "--is-ancestor", ancestor, descendant], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return true;
  } catch (e: unknown) {
    const status = (e as { status?: number }).status;
    if (status === 1) return false; // 조상 아님 — 정상 판정
    return null; // 오류(commit 을 모름 등) — 판정 불가
  }
}
