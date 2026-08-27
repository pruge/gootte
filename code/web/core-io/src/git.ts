import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

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
 * `gitSafe` 와 같지만 **선두 공백을 지우지 않는다** — porcelain 출력의 첫 줄(예: " M path")은
 * 상태 코드 두 칸(`XY`)이 공백으로 시작할 수 있어, 전체 트림이 그 칸을 먹어 파싱이 밀린다
 * (실측 결함, T04). 끝의 개행만 없앤다.
 */
function gitSafeRaw(repo: string, args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).replace(/\n+$/, "");
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
  return existsSync(join(repo, ".git")) && gitSafe(repo, ["rev-parse", "--git-dir"]) !== null;
}

/** HEAD 가 가리키는 commit 해시. detached 도 해시로 답한다. 못 읽으면 null. */
export function headCommit(repo: string): string | null {
  if (!isRepo(repo)) return null;
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
 * `paths`(repo 루트 기준) 중 추적 제외된 것 — `git check-ignore --stdin` 한 번으로 전부 묻는다
 * (T04 §구현 노트, 기능 폴더 단위로 호출 수를 줄인다). 돌려주는 Set 은 `paths` 의 부분집합
 * (매치된 줄을 그대로 돌려주는 `check-ignore` 의 성질을 그대로 쓴다 — 다시 파싱하지 않는다).
 * 아무것도 안 걸리면 빈 Set(exit 1 은 오류가 아니라 "전부 추적됨"). git 이 답하지 못하면(저장소
 * 아님 등) null — 판정 불가와 "제외 없음" 을 구분한다(호출자가 표식 없이 그대로 보여줘야 한다).
 */
export function checkIgnored(repo: string, paths: readonly string[]): Set<string> | null {
  if (paths.length === 0) return new Set();
  try {
    const out = execFileSync("git", ["-C", repo, "check-ignore", "--stdin"], {
      input: `${paths.join("\n")}\n`,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return new Set(out.split("\n").map((l) => l.trim()).filter(Boolean));
  } catch (e: unknown) {
    const status = (e as { status?: number }).status;
    if (status === 1) return new Set(); // exit 1 = 아무 경로도 안 걸림(정상 결과, 오류 아님)
    return null; // 128 등 — 저장소가 아니거나 그 밖의 이유로 못 물었다
  }
}

/**
 * `dir`(repo 루트 기준) 아래에서 커밋 안 된(미착지) 경로들 — `git status --porcelain -- <dir>`
 * 한 번으로 기능 폴더 전체를 묻는다(T04 §구현 노트). 추적 안 됨(`??`)과 고쳐짐(` M` 등)을
 * 가르지 않는다 — 캡틴께는 둘 다 "아직 안 올라간 것"(T04 §구현 노트). git 이 답하지 않으면 null.
 */
export function unlandedPaths(repo: string, dir: string): Set<string> | null {
  // `--untracked-files=all` — 기본값은 새 폴더를 통째로 한 줄(`?? issues/`)로 뭉쳐 파일별 경로를
  // 못 준다. 문서 트리 노드 하나하나에 표식을 실으려면 파일 단위 경로가 있어야 한다.
  // 🔴 `gitSafe`(전체 trim) 를 쓰지 않는다 — porcelain 첫 줄(" M path")의 선두 공백이 상태 코드
  // 칸이라 트림에 먹히면 파싱이 한 칸 밀린다(실측 결함).
  const out = gitSafeRaw(repo, ["status", "--porcelain", "--untracked-files=all", "--", dir]);
  if (out === null) return null;
  const set = new Set<string>();
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    // porcelain V1 한 줄 = "XY <경로>"(2 문자 코드 + 공백 + 경로). rename 은 "R  a -> b" 라
    // 화살표 뒤 새 경로를 쓴다 — 문서 파일 이름 변경은 흔치 않지만 감추지 않는다.
    const path = line.includes(" -> ") ? line.split(" -> ").pop()!.trim() : line.slice(3).trim();
    if (path) set.add(path);
  }
  return set;
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
