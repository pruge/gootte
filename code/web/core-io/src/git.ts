import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
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

export function mergeBase(repo: string, a: string, b: string): string | null {
  return gitSafe(repo, ["merge-base", a, b]);
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

/** `.claude/worktrees/` 스캔 → 원시 worktree(slug/branch/base). 목록 뷰의 worktree 배지 수 소스. */
export interface RawWorktree {
  slug: string;
  branch: string;
  base: string;
}

export function scanWorktrees(repo: string, mainRef = "main"): RawWorktree[] {
  const dir = join(repo, ".claude", "worktrees");
  if (!existsSync(dir)) return [];
  const out: RawWorktree[] = [];
  for (const slug of readdirSync(dir)) {
    const wt = join(dir, slug);
    const branch = gitSafe(wt, ["branch", "--show-current"]) ?? "";
    const base = branch ? (mergeBase(repo, mainRef, branch) ?? "") : "";
    out.push({ slug, branch, base });
  }
  return out;
}
