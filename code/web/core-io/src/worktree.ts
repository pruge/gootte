import type { WorktreeStatus, GitSignal } from "@gootte/contract";
import type { LoadedProject } from "./load";

/** 신호 미조립(base 없음·rev 실패) worktree 기본값 — 충돌 없음. */
const NO_SIGNAL: GitSignal = { mainCommitsSince: 0, overlapFiles: [], conflictRisk: "low" };

/**
 * 활성 worktree → WorktreeStatus[] — **사이드바 카운트·본문 "작업중"의 단일 소스**(033).
 * state.worktrees(스캔 1:1 바인딩)를 그대로 투영 → 이니셔티브당 N worktree 온전(collapse X).
 * 사이드바 배지 수 = 이 목록의 length(= scanWorktrees(repo).length)와 항상 일치.
 */
export function activeWorktrees({ state, worktreeSignals }: LoadedProject): WorktreeStatus[] {
  return state.worktrees.map((b) => ({
    slug: b.worktree.slug,
    branch: b.worktree.branch,
    base: b.worktree.base,
    initiative: b.initiative,
    sprint: b.sprint,
    signal: worktreeSignals.get(b.worktree.slug) ?? NO_SIGNAL,
  }));
}
