import { z } from "zod";

/**
 * @gootte/contract — 공유 타입 SoT (blueprint seam).
 * 모든 소비처(core·core-io·cli·후속 web/Android)가 여기서 파생. 손편집 금지 대상 아님(직접 SoT).
 */

// ── enums ────────────────────────────────────────────────
export const TodoStatus = z.enum(["pending", "in_sprint", "in_progress", "done", "dropped"]);
export type TodoStatus = z.infer<typeof TodoStatus>;
export const Priority = z.enum(["critical", "high", "normal", "low"]);
export const InitiativeStatus = z.enum(["active", "shipped", "planned", "superseded"]);
export const ConflictRisk = z.enum(["low", "med", "high"]);
export const KickoffKind = z.enum(["kickoff", "re-kickoff"]);
export const LineageNodeKind = z.enum(["initiative", "adr"]);
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

// ── firstmate 문서 파생 (docs/features/) ─────────────────
/**
 * 관리대상 firstmate 티켓의 정규 `Status:` 여덟 값 — external-reader seam.
 * SoT 는 관리대상의 `docs/agents/triage-labels.md`. 이 저장소 자신의 티켓 어휘와 동형이지만
 * 여기 실리는 것은 **관리대상 문서를 파싱한 결과**다.
 */
export const FirstmateStatus = z.enum([
  "draft",
  "needs-triage",
  "needs-info",
  "ready-for-agent",
  "ready-for-human",
  "blocked",
  "resolved",
  "wontfix",
]);
export type FirstmateStatus = z.infer<typeof FirstmateStatus>;

/**
 * `docs/features/<기능>/issues/<NN>-<슬러그>.md` 티켓 1장.
 *
 * 🔴 상태는 **두 칸**이다(결정 Q3) — `status` 는 화면이 오늘 쓰는 다섯 값,
 * `sourceStatus` 는 firstmate 원문 여덟 값 verbatim. 뭉개는 쪽이 아니라 함께 싣는 쪽이라
 * 화면이 `blocked`(외부 대기)와 `needs-info`(정보 부족)를 구분해 보여줄 수 있다.
 * `in_progress` 는 여기서 나오지 않는다 — 그것은 문서가 아니라 격리 사본 관측의 몫이다.
 */
export const FeatureTicket = z.object({
  num: z.string(), // 파일명 앞 번호("01"). 번호 없는 파일이면 빈 문자열
  slug: z.string(), // 파일 basename(확장자 제거) — "01-discover-firstmate"
  title: z.string(),
  status: TodoStatus, // 사상된 다섯 값 (resolved→done · wontfix→dropped · 나머지→pending)
  sourceStatus: z.string().nullable().default(null), // 원문 verbatim. `Status:` 줄이 없으면 null
  statusKnown: z.boolean(), // 원문이 여덟 값에 없거나 줄이 없으면 false — 🔴 조용히 버리지 않는다
  completedAt: z.string().optional(), // `resolved (YYYY-MM-DD)` 의 완료일
  // `Blocked by:` 한 항목 = 한 원소. 번호("01") 아니면 번호로 특정되지 않은 문구(verbatim).
  blockedBy: z.array(z.string()).default([]),
  waitingOn: z.array(z.string()).default([]), // 그중 아직 완료가 아닌 것 — 계산
  startable: z.boolean(), // waitingOn 이 비면 true — 계산이지 파일에 적힌 값이 아니다(INV-1)
  // 이 티켓을 지금 붙들고 있는 격리 사본의 브랜치 이름(verbatim). 관측 파생이라 파일에 없다.
  // 한 티켓을 두 사본이 붙들면 원소 둘 — 그래도 티켓은 하나로 센다.
  workedBy: z.array(z.string()).default([]),
});
export type FeatureTicket = z.infer<typeof FeatureTicket>;

/** `docs/features/<기능>/` 한 폴더 = spec 1장 + 티켓 N장. */
export const Feature = z.object({
  slug: z.string(), // 폴더명
  title: z.string(), // spec.md 표제(없으면 slug)
  status: TodoStatus,
  sourceStatus: z.string().nullable().default(null),
  statusKnown: z.boolean(),
  tickets: z.array(FeatureTicket).default([]),
});
export type Feature = z.infer<typeof Feature>;

/**
 * 작업중이지만 티켓에 잇지 못한 격리 사본 하나 — **감추지 않는다**.
 * 조용히 빠뜨리면 화면이 "아무도 아무것도 안 하는 중" 이라고 거짓말하고,
 * 캡틴은 이미 진행 중인 일을 다시 배정한다.
 */
export const UnmappedWork = z.object({
  slug: z.string(), // `<풀>/<슬롯>` — 사람이 찾아갈 수 있는 식별자
  branch: z.string(), // 작업 브랜치 이름 verbatim (요약·추론 없음, INV-4)
  path: z.string(), // 사본 경로
});
export type UnmappedWork = z.infer<typeof UnmappedWork>;

/**
 * 상태를 **읽지 못한** 사본 — 유휴인지 작업중인지 말할 수 없다.
 * 🔴 이것을 유휴로 접어 넣지 않는다. 읽기 실패를 "아무도 안 붙들었다" 로 바꾸는 순간
 * `unknown` 을 감추는 것과 똑같은 거짓말이 된다. 모른다는 사실 그대로 센다.
 */
export const UnreadableCopy = z.object({
  slug: z.string(),
  path: z.string(),
  reason: z.enum(["no-repo", "git-failed"]), // 저장소를 못 찾음 / git 이 답하지 않음
});
export type UnreadableCopy = z.infer<typeof UnreadableCopy>;

/**
 * "지금 누가 무엇을 붙들고 있나" — 격리 사본 관측 파생.
 * 🔴 어디에도 저장하지 않는다(INV-1). 볼 때마다 사본들을 다시 관측한다(INV-3).
 */
export const InProgressSummary = z.object({
  root: z.string(), // 스캔한 격리 사본 뿌리
  rootExists: z.boolean(), // 뿌리가 없으면 false — 빈 결과지 오류가 아니다
  copies: z.number().int().nonnegative(), // 이 프로젝트의 사본 수 — 못 읽은 것까지 전부
  working: z.number().int().nonnegative(), // 그중 작업 가지에 올라가 있음이 **확인된** 수
  tickets: z.number().int().nonnegative(), // 처리중으로 계산된 **티켓** 수 — 사본 수가 아니다(중복 제거)
  unknown: z.array(UnmappedWork).default([]), // 🔴 작업중인데 티켓 미상
  unreadable: z.array(UnreadableCopy).default([]), // 🔴 상태를 못 읽은 사본 — 유휴로 접지 않는다
});
export type InProgressSummary = z.infer<typeof InProgressSummary>;

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

/**
 * 기능별 할일 목록 — `docs/features/` 파생(INV-2 read-only, INV-1 매 read 재계산).
 * `inProgress` 는 격리 사본 관측 파생이라 입력이 다르다 — 문서에는 처리중이 적혀 있지 않다.
 */
export const FeaturesResponse = z.object({
  project: z.string(),
  features: z.array(Feature).default([]),
  inProgress: InProgressSummary,
});
export type FeaturesResponse = z.infer<typeof FeaturesResponse>;

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
