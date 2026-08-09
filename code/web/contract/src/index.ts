import { z } from "zod";

/**
 * @gootte/contract — 공유 타입 SoT.
 * 모든 소비처(core·core-io·cli·backend·frontend·후속 Android)가 여기서 파생. 손편집 금지 대상 아님(직접 SoT).
 */

// ── enums ────────────────────────────────────────────────
/**
 * 화면이 쓰는 다섯 값 — 결정 Q3 이 "기존 다섯 값 형태를 그대로 쓴다" 로 닫았다.
 * 관리대상 원문 여덟 값은 뭉개지 않고 `sourceStatus` 에 따로 실린다.
 */
export const TodoStatus = z.enum(["pending", "in_sprint", "in_progress", "done", "dropped"]);
export type TodoStatus = z.infer<typeof TodoStatus>;

// ── 관리대상 프로젝트 (ⓐ source = machine, 예약) ──────────
export const Project = z.object({
  slug: z.string(),
  path: z.string(),
  source: z.string().optional(),
});
export type Project = z.infer<typeof Project>;

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

/**
 * 기능 폴더 문서 트리 노드 — 폴더에 **실제로 있는 것만**(INV-4, 티켓 01 §설계 3).
 * `issues/` 는 티켓 목록이 따로 싣기 때문에 여기서 빠진다(`core-io/src/features.ts`).
 * 재귀 구조라 `z.lazy` — 순환 타입을 끊으려면 인터페이스를 먼저 선언해야 한다.
 */
export interface FeatureDocNode {
  kind: "file" | "dir";
  name: string; // 파일/폴더명
  path: string; // 기능 폴더 기준 상대 경로("adr/0001-x.md") — 문서 읽기 API 의 `path` 로 그대로 쓴다
  children?: FeatureDocNode[]; // kind: "dir" 일 때만
}
export const FeatureDocNode: z.ZodType<FeatureDocNode> = z.lazy(() =>
  z.object({
    kind: z.enum(["file", "dir"]),
    name: z.string(),
    path: z.string(),
    children: z.array(FeatureDocNode).optional(),
  }),
);

/** `docs/features/<기능>/` 한 폴더 = spec 1장 + 티켓 N장 + 문서 트리. */
export const Feature = z.object({
  slug: z.string(), // 폴더명
  title: z.string(), // spec.md 표제(없으면 slug)
  status: TodoStatus,
  sourceStatus: z.string().nullable().default(null),
  statusKnown: z.boolean(),
  tickets: z.array(FeatureTicket).default([]),
  docs: z.array(FeatureDocNode).default([]), // 폴더 트리(issues 제외) — 티켓 01 §설계 3
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

// ── API envelope (backend 생산 · frontend 소비 = cross-boundary seam) ──────
// 2a web-dashboard. HTTP 경계를 넘는 공유 응답 타입 — backend/frontend 재선언 금지(단일 SoT).
export const ProjectsResponse = z.object({
  projects: z.array(Project),
});
export type ProjectsResponse = z.infer<typeof ProjectsResponse>;

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

/**
 * 기능 폴더 문서 본문 하나 — read-only(INV-2). `path` 는 기능 폴더 기준 상대 경로이고,
 * 서버는 이 경로가 그 폴더 밖으로 벗어나면 거절한다(티켓 01 §설계 4 🔴).
 */
export const FeatureDocResponse = z.object({
  path: z.string(),
  content: z.string(),
});
export type FeatureDocResponse = z.infer<typeof FeatureDocResponse>;

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
