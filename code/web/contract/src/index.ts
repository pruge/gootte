import { z } from "zod";

/**
 * @gootte/contract — 공유 타입 SoT (blueprint seam).
 * 모든 소비처(core·core-io·cli·후속 web/Android)가 여기서 파생. 손편집 금지 대상 아님(직접 SoT).
 */

// ── enums ────────────────────────────────────────────────
export const TodoStatus = z.enum(["pending", "in_sprint", "in_progress", "done", "dropped"]);
export const Priority = z.enum(["critical", "high", "normal", "low"]);
export const InitiativeStatus = z.enum(["active", "shipped", "planned", "superseded"]);
export const ConflictRisk = z.enum(["low", "med", "high"]);
export const KickoffKind = z.enum(["kickoff", "re-kickoff"]);
export const LineageNodeKind = z.enum(["initiative", "adr", "mermaid"]);
export const LineageEdgeKind = z.enum(["supersede", "spawn", "dep"]);

// ── 관리대상 프로젝트 (ⓐ source = machine, 예약) ──────────
export const Project = z.object({
  slug: z.string(),
  path: z.string(),
  source: z.string().optional(),
});
export type Project = z.infer<typeof Project>;

// ── cling 문서 파생 ──────────────────────────────────────
export const TodoItem = z.object({
  slug: z.string(),
  status: TodoStatus,
  priority: Priority,
  initiative: z.string().nullable().default(null),
  created: z.string(),
  completedAt: z.string().optional(),
});
export type TodoItem = z.infer<typeof TodoItem>;

export const Sprint = z.object({
  slug: z.string(),
  status: z.enum(["pending", "in_progress", "done"]),
  todos: z.array(z.string()).default([]),
  worktree: z.string().nullable().default(null),
});
export type Sprint = z.infer<typeof Sprint>;

export const Initiative = z.object({
  slug: z.string(),
  track: z.string().optional(),
  status: InitiativeStatus,
  deps: z.array(z.string()).default([]),
  todos: z.array(z.string()).default([]),
});
export type Initiative = z.infer<typeof Initiative>;

/** re-kickoff 기록 계약 — external-writer seam (gootte reader + cling writer 공동소유). */
export const KickoffEvent = z.object({
  initiative: z.string(),
  kind: KickoffKind,
  at: z.string(),
  trigger: z.string().nullable().default(null),
  interrupted: z.string().nullable().default(null),
  supersedes: z.array(z.string()).default([]),
  spawns: z.array(z.string()).default([]),
});
export type KickoffEvent = z.infer<typeof KickoffEvent>;

// ── lineage 그래프 ───────────────────────────────────────
export const LineageNode = z.object({
  id: z.string(),
  kind: LineageNodeKind,
  status: z.string(),
});
export type LineageNode = z.infer<typeof LineageNode>;

export const LineageEdge = z.object({
  from: z.string(),
  to: z.string(),
  kind: LineageEdgeKind,
});
export type LineageEdge = z.infer<typeof LineageEdge>;

// ── worktree / git ───────────────────────────────────────
export const Worktree = z.object({
  slug: z.string(),
  branch: z.string(),
  base: z.string(),
  initiative: z.string().nullable(),
});
export type Worktree = z.infer<typeof Worktree>;

export const GitSignal = z.object({
  worktreeBase: z.string().optional(),
  mainCommitsSince: z.number().int().nonnegative(),
  overlapFiles: z.array(z.string()).default([]),
  conflictRisk: ConflictRisk,
});
export type GitSignal = z.infer<typeof GitSignal>;

// ── projection 산출 (plan + rationale) ───────────────────
export const PlanItem = z.object({
  order: z.number().int(),
  initiative: z.string(),
  track: z.string().optional(),
  status: z.string(),
  now: z.boolean(),
  subSteps: z.array(z.string()).default([]),
  deps: z.array(z.string()).default([]),
  completeOn: z.string().optional(),
});
export type PlanItem = z.infer<typeof PlanItem>;

export const PlanRationale = z.object({
  initiative: z.string(),
  priorityBasis: z.string(),
  delayCost: z.string().nullable().default(null),
  independence: z.string().nullable().default(null),
  stoppingPoint: z.string().nullable().default(null),
});
export type PlanRationale = z.infer<typeof PlanRationale>;

/** AUTO-GENERATED digest (AI floor). */
export const Digest = z.object({
  generatedAt: z.string(),
  project: z.string(),
  plan: z.array(PlanItem),
  rationale: z.array(PlanRationale),
});
export type Digest = z.infer<typeof Digest>;
