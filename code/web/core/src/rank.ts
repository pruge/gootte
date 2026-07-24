import type { TodoItem, GitSignal } from "@gootte/contract";

export type Priority = TodoItem["priority"];
export type Risk = GitSignal["conflictRisk"];

export const PRIORITY_RANK: Record<Priority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

/** 방치비용 정렬 — high 먼저. */
export const RISK_RANK: Record<Risk, number> = { high: 0, med: 1, low: 2 };
