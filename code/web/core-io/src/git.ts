import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { GitSignal } from "@gootte/contract";

/** IO 층 — git CLI 위임. 전부 읽기 전용(INV-2). */

function git(repo: string, args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
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
