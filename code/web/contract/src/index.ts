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
export const LineageEdgeKind = z.enum(["supersede", "supersede-partial", "spawn", "dep", "reference"]);

// ── 관리대상 프로젝트 (ⓐ source = machine, 예약) ──────────
export const Project = z.object({
  slug: z.string(),
  path: z.string(),
  source: z.string().optional(),
  worktrees: z.number().int().nonnegative().optional(), // 활성 worktree(작업중) 수 — projects 목록 enrich(discover 는 미설정)
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
  resolvedBy: z.string().optional(), // dropped 시 — 무엇이 대체/흡수 (verbatim)
  source: z.string().optional(), // spec-decompose 등
  related: z.array(z.string()).optional(), // 관련 spec/todo 경로 — initiative:null 일 때 이니셔티브 추론 소스
});
export type TodoItem = z.infer<typeof TodoItem>;

export const Sprint = z.object({
  slug: z.string(),
  status: z.enum(["pending", "in_progress", "done"]),
  todos: z.array(z.string()).default([]),
  worktree: z.string().nullable().default(null),
  created: z.string().optional(), // 날짜 YYYY-MM-DD — Gantt 바 기간 소스(2c)
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
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
  note: z.string().optional(), // verbatim 왜 (요약 X — INV-4)
  adr: z.array(z.string()).optional(), // 근거 앵커 (ADR-N)
});
export type LineageEdge = z.infer<typeof LineageEdge>;

/** INDEX `## Supersession 색인` 한 줄. */
export const Supersession = z.object({
  old: z.string(),
  new: z.string(),
  ledger: z.string(),
  adr: z.array(z.string()).default([]),
  note: z.string(),
});
export type Supersession = z.infer<typeof Supersession>;

/** dropped todo (resolvedBy = 무엇이 이걸 drop 시켰나). */
export const DropRecord = z.object({
  todo: z.string(),
  initiative: z.string().nullable().default(null),
  resolvedBy: z.string(),
  at: z.string(),
});
export type DropRecord = z.infer<typeof DropRecord>;

/** 타임라인 이벤트 — 타입 정의만, 채움 = phase 2(W1). */
export const TimelineEvent = z.object({
  at: z.string(),
  kind: z.string(),
  ref: z.string(),
  summary: z.string(),
});
export type TimelineEvent = z.infer<typeof TimelineEvent>;

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
/**
 * 대분류(track) — external-writer seam (cling writer + gootte reader 공동소유, KickoffEvent 동형).
 * 관리대상 ledger `track:`(frontmatter) 또는 프로즈 `트랙:` → 정규화 → {key,label}. label SoT = profile `## Tracks`.
 */
export const Track = z.object({
  key: z.string(), // canonical 식별자 (A~G 또는 도메인 slug) — 그룹핑 키
  label: z.string(), // 사람 읽는 한 줄 (어휘/프로즈에서 verbatim)
});
export type Track = z.infer<typeof Track>;

export const PlanItem = z.object({
  order: z.number().int(),
  initiative: z.string(),
  track: Track.nullable().default(null), // 대분류 — 정규화 {key,label} (019 buildGantt 와 동일). 미분류=null
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

// ── roadmap projection (plan 리스트 v2 — 018) ────────────
/**
 * roadmap 이니셔티브 1개 — 완료(shipped)/진행(active)/예정(planned) + 할일 체크리스트.
 * done/pending = 그 이니셔티브 todos(archive된 done 포함)를 상태로 재구성(INV-1, ledger md 파싱 X).
 */
export const RoadmapItem = z.object({
  initiative: z.string(),
  track: Track.nullable().default(null), // 대분류 — 정규화 {key,label} (미분류=null)
  status: InitiativeStatus, // active | shipped | planned (superseded 제외 — lineage 관심사)
  done: z.array(z.string()).default([]), // 한일 — done todo slug (☑)
  pending: z.array(z.string()).default([]), // 남은일 — 미완 todo slug (☐, dropped 제외)
});
export type RoadmapItem = z.infer<typeof RoadmapItem>;

export const RoadmapResponse = z.object({
  project: z.string(),
  items: z.array(RoadmapItem),
  trackOrder: z.array(z.string()).default([]), // 대분류 그룹 순서 — 미분류 = "__ungrouped__" last
});
export type RoadmapResponse = z.infer<typeof RoadmapResponse>;

/** AUTO-GENERATED digest (AI floor). */
export const Digest = z.object({
  generatedAt: z.string(),
  project: z.string(),
  plan: z.array(PlanItem),
  rationale: z.array(PlanRationale),
});
export type Digest = z.infer<typeof Digest>;

// ── API envelope (backend 생산 · frontend 소비 = cross-boundary seam) ──────
// 2a web-dashboard. HTTP 경계를 넘는 공유 응답 타입 — backend/frontend 재선언 금지(단일 SoT).
export const ProjectsResponse = z.object({
  projects: z.array(Project),
});
export type ProjectsResponse = z.infer<typeof ProjectsResponse>;

export const PlanResponse = z.object({
  project: z.string(),
  plan: z.array(PlanItem),
  rationale: z.array(PlanRationale),
  trackOrder: z.array(z.string()).default([]), // 대분류 그룹 순서 (019 populate) — 미분류 = "__ungrouped__" last
});
export type PlanResponse = z.infer<typeof PlanResponse>;

export const LineageResponse = z.object({
  project: z.string(),
  // nodes = 그래프 스파인(status/kind). 2a 체인 뷰는 무시, 2c 그래프가 사용(additive).
  nodes: z.array(LineageNode).default([]),
  // edges = CORE 해소 결과(kind supersede/partial/reference·note verbatim·adr). partial 색·ADR 배지는
  // frontend가 kind를 재계산하지 않게 서버가 확정해 보냄(INV-4 — 해소는 CORE 결정적).
  edges: z.array(LineageEdge),
  drops: z.array(DropRecord),
});
export type LineageResponse = z.infer<typeof LineageResponse>;

// ── 2c viz projection (칸반·Gantt·worktree) — CORE 결정적 산출 ──────────────
export const KanbanColumn = z.object({
  key: z.enum(["active", "ready", "blocked"]),
  title: z.string(),
  items: z.array(PlanItem),
});
export type KanbanColumn = z.infer<typeof KanbanColumn>;

/** Gantt 바 — sprint 기간(날짜). worktree는 날짜 소스 없어 제외(패널이 담당). */
export const GanttBar = z.object({
  kind: z.literal("sprint"),
  label: z.string(),
  start: z.string(), // YYYY-MM-DD
  end: z.string(),
});
export type GanttBar = z.infer<typeof GanttBar>;

export const GanttMarker = z.object({
  at: z.string(), // YYYY-MM-DD
  kind: KickoffKind,
  label: z.string(),
});
export type GanttMarker = z.infer<typeof GanttMarker>;

export const GanttRow = z.object({
  initiative: z.string(),
  track: Track.nullable().default(null), // 대분류 — 019 projection 이 정규화 부착(018=stub null)
  bars: z.array(GanttBar).default([]),
  markers: z.array(GanttMarker).default([]),
});
export type GanttRow = z.infer<typeof GanttRow>;

export const WorktreeStatus = z.object({
  slug: z.string(),
  branch: z.string(),
  base: z.string(),
  initiative: z.string().nullable(),
  sprint: z.string().nullable(),
  signal: GitSignal,
});
export type WorktreeStatus = z.infer<typeof WorktreeStatus>;

// ── viz envelope (backend 생산·frontend 소비) ──────────────────────────────
export const BoardResponse = z.object({
  project: z.string(),
  columns: z.array(KanbanColumn),
});
export type BoardResponse = z.infer<typeof BoardResponse>;

export const TimelineResponse = z.object({
  project: z.string(),
  from: z.string().nullable(),
  to: z.string().nullable(),
  rows: z.array(GanttRow),
  trackOrder: z.array(z.string()).default([]), // 대분류 그룹 순서 (019 populate) — 미분류 = "__ungrouped__" last
});
export type TimelineResponse = z.infer<typeof TimelineResponse>;

export const WorktreeResponse = z.object({
  project: z.string(),
  worktrees: z.array(WorktreeStatus),
});
export type WorktreeResponse = z.infer<typeof WorktreeResponse>;

/** 관리대상 문서(todo/sprint/roadmap) raw md — 드릴다운 뷰어(018) + 문서 브라우저(2e). INV-2 read-only. */
export const DocKind = z.enum(["todo", "sprint", "roadmap"]);
export const DocResponse = z.object({
  project: z.string(),
  kind: DocKind,
  name: z.string(), // todo/sprint = slug · roadmap = 이니셔티브 폴더 상대경로
  path: z.string(), // repo 기준 상대 경로 (archive·worktree 반영)
  archived: z.boolean(),
  worktree: z.string().optional(), // worktree 트리에서 읽었으면 그 slug (미커밋 라이브 버전)
  content: z.string(), // raw markdown (verbatim — INV-4)
});
export type DocResponse = z.infer<typeof DocResponse>;

// ── 문서 브라우저(2e) — 이니셔티브 폴더 tree 나열 seam (backend 생산 · frontend cd 소비) ──────
/** 파일 열기 참조 — source 판별. roadmap = 이니셔티브 폴더 상대경로, todo/sprint = 기존 basename read. */
export const DocRef = z.discriminatedUnion("source", [
  z.object({ source: z.literal("roadmap"), initiative: z.string(), relPath: z.string() }),
  z.object({ source: z.literal("todo"), name: z.string() }),
  z.object({ source: z.literal("sprint"), name: z.string() }),
]);
export type DocRef = z.infer<typeof DocRef>;

/** tree 노드(flat) — path=브라우저 논리경로, dir 은 read 없음. INV-4 결정적. */
export const TreeNode = z.object({
  name: z.string(),
  type: z.enum(["file", "dir"]),
  path: z.string(), // spec.md · adr · adr/0001-x.md · todo · todo/016-graph-view.md
  read: DocRef.optional(), // file 만
  badge: z.string().nullable().default(null), // 가상 todo 노드 status(진행/완료)
});
export type TreeNode = z.infer<typeof TreeNode>;

export const TreeResponse = z.object({
  project: z.string(),
  initiative: z.string(),
  nodes: z.array(TreeNode), // flat — 프론트가 path prefix 로 cd
});
export type TreeResponse = z.infer<typeof TreeResponse>;

// ── 실시간(2b) — WS 메시지 seam (backend watcher 생산 · frontend 소비, 단일 방향) ──────
/**
 * 파일 변경 push 신호 — INV-4(해석·요약 X, "바뀜"만). coarse 단위(ADR-0004):
 * `project` = 그 프로젝트 문서/worktree 변경 → 그 프로젝트 쿼리 invalidate.
 * `projects` = 프로젝트 추가/삭제 → projects 쿼리 invalidate(+서버 discover-cache bust).
 */
export const ChangeEvent = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("project"), project: z.string() }),
  z.object({ kind: z.literal("projects") }),
]);
export type ChangeEvent = z.infer<typeof ChangeEvent>;

/** 에러 응답 (slug 미해소 404 등). */
export const ApiError = z.object({
  error: z.string(),
});
export type ApiError = z.infer<typeof ApiError>;
