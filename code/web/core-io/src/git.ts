import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { GitSignal } from "@gootte/contract";

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

export function mainCommitsSince(repo: string, base: string, mainTip: string): number {
  const out = gitSafe(repo, ["rev-list", "--count", `${base}..${mainTip}`]);
  return out ? Number.parseInt(out, 10) || 0 : 0;
}

/** main Δ(base→mainTip) ∩ worktree Δ(base→wtTip). */
export function overlapFiles(repo: string, base: string, mainTip: string, wtTip: string): string[] {
  const mainFiles = new Set(
    (gitSafe(repo, ["diff", "--name-only", base, mainTip]) ?? "").split("\n").filter(Boolean),
  );
  const wtFiles = (gitSafe(repo, ["diff", "--name-only", base, wtTip]) ?? "")
    .split("\n")
    .filter(Boolean);
  return wtFiles.filter((f) => mainFiles.has(f));
}

/**
 * B1 — conflictRisk via `git merge-tree` dry-run.
 * 실제 충돌 → high · 충돌 없고 overlap 있음 → med · 없음 → low.
 */
export function conflictRisk(
  repo: string,
  base: string,
  mainTip: string,
  wtTip: string,
): "low" | "med" | "high" {
  const overlap = overlapFiles(repo, base, mainTip, wtTip).length > 0;
  if (hasMergeConflict(repo, base, mainTip, wtTip)) return "high";
  return overlap ? "med" : "low";
}

function hasMergeConflict(repo: string, base: string, mainTip: string, wtTip: string): boolean {
  // 신 git: `merge-tree --write-tree` 는 충돌 시 exit 1.
  try {
    execFileSync("git", ["-C", repo, "merge-tree", "--write-tree", mainTip, wtTip], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return false;
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 1) return true;
    // 구 git(3-arg) fallback: 출력에 충돌 마커.
    const out = gitSafe(repo, ["merge-tree", base, mainTip, wtTip]);
    return out != null && out.includes("<<<<<<<");
  }
}

/** GitSignal 원시 계산(refs 만) — per-initiative 조립은 projections(T5)가 state 매핑으로. */
export function computeGitSignal(
  repo: string,
  base: string,
  mainTip: string,
  wtTip: string,
): GitSignal {
  return {
    worktreeBase: base,
    mainCommitsSince: mainCommitsSince(repo, base, mainTip),
    overlapFiles: overlapFiles(repo, base, mainTip, wtTip),
    conflictRisk: conflictRisk(repo, base, mainTip, wtTip),
  };
}

/** `.claude/worktrees/` 스캔 → 원시 worktree(slug/branch/base). initiative 매핑은 순수 state(T3). */
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
