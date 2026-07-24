import type { TodoItem, Sprint, LineageNode, LineageEdge, KickoffEvent } from "@gootte/contract";
import type { LedgerInfo } from "../parse/ledger";
import type { Priority } from "../rank";

/** core-io 가 준 raw worktree(순수 core 는 core-io 를 import 안 함 — 형태만 공유). */
export interface WorktreeInput {
  slug: string;
  branch: string;
  base: string;
}

export interface StateInput {
  ledgers: LedgerInfo[];
  todos: TodoItem[];
  sprints: Sprint[];
  worktrees: WorktreeInput[];
  /** spec.md 가 존재하는 이니셔티브 slug (IO 가 판정 — 설계완결 proxy). */
  specPresent: string[];
  /** INDEX Now/Next 저작 순서 (ordering tiebreak). */
  indexOrder?: string[];
}

export interface InitiativeState {
  slug: string;
  status: string;
  track: string | null;
  deps: string[];
  priority: Priority;
  todos: TodoItem[];
  activeTodos: number;
  hasSpec: boolean;
  worktree: WorktreeInput | null;
  events: KickoffEvent[];
}

export interface ProjectState {
  initiatives: InitiativeState[];
  lineage: { nodes: LineageNode[]; edges: LineageEdge[] };
  indexOrder: string[];
}
