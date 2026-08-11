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
  // 남은 일이 있는 기능 수 — projects 목록 enrich(discover 는 미설정이라 optional).
  // 파생물이라 요청마다 다시 센다(INV-1·INV-3). 0 과 "미설정" 은 다른 값이다 —
  // 0 은 "다 끝났다", 미설정은 "안 세어봤다" 라서 화면이 둘을 같게 그리면 거짓말이 된다.
  openFeatures: z.number().int().nonnegative().optional(),
});
export type Project = z.infer<typeof Project>;

// ── firstmate 문서 파생 (docs/features/) ─────────────────
/**
 * 관리대상 firstmate 티켓의 정규 `Status:` 아홉 값 — external-reader seam.
 * SoT 는 관리대상의 `docs/agents/triage-labels.md`. 이 저장소 자신의 티켓 어휘와 동형이지만
 * 여기 실리는 것은 **관리대상 문서를 파싱한 결과**다.
 * 🔴 `claimed` = 누군가 이 티켓을 집어갔다(임자 있음). 이 값 자체로는 처리중을 만들지 않는다 —
 * 처리중은 여전히 살아 있는 격리 사본 관측만이 만든다(work-claims-its-ticket/01 §B).
 */
export const FirstmateStatus = z.enum([
  "draft",
  "needs-triage",
  "needs-info",
  "ready-for-agent",
  "ready-for-human",
  "blocked",
  "claimed",
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
  // 번호도 "없음" 도 못 알아들은 산문 — verbatim. 막지 않되(startable 계산에서 빠진다) 감추지도 않는다
  // — `computeMismatches` 가 이 값을 어긋남 목록에 올린다(development-order/11).
  unreadableBlockedBy: z.array(z.string()).default([]),
  waitingOn: z.array(z.string()).default([]), // 그중 아직 완료가 아닌 것 — 계산
  // 착수 가능 = waitingOn 이 비었고 + 임자(claimed)가 없다 — 계산이지 파일에 적힌 값이 아니다(INV-1).
  // 판정하는 자리는 여기 하나뿐이다 — 머리글 집계와 줄 표시가 이 값을 그대로 센다(같은 결함을 반복하지 않는다).
  startable: z.boolean(),
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
 * 문서는 `claimed` 라고 말하는데 지금 그 티켓을 붙들고 있는 살아 있는 사본이 없는 티켓 —
 * **지우다 만 흔적.** 정상 경로에서는 안 생긴다(임자 표시는 작업자 가지에만 있고 끝나면 `resolved`
 * 로 덮인다) — 머지됐는데 완료로 안 바뀐 경우에만 남는다. `unknown`·`unreadable` 과 같은 원리로
 * 감추지 않는다(work-claims-its-ticket/01 §D). 처리중으로도 그리지 않는다 — 임자가 있다는 주장과
 * 실제로 돌고 있다는 사실은 다른 것이다.
 */
export const UnclaimedTicket = z.object({
  feature: z.string(), // 기능 slug
  ticket: z.string(), // 티켓 slug("01-claimed-means-taken")
  title: z.string(),
});
export type UnclaimedTicket = z.infer<typeof UnclaimedTicket>;

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
  unclaimed: z.array(UnclaimedTicket).default([]), // 🔴 claimed 인데 붙든 사본이 없는 티켓 — 감추지 않는다
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
 * `plan` = gootte 자기 계획 저장소(`plan.db`)가 바뀌었다(드래그 또는 CLI) → project 는 없다,
 *   파일 워처는 어느 프로젝트인지 모르니(development-order/07) `plan` 쿼리 전부 invalidate.
 */
export const ChangeEvent = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("project"), project: z.string() }),
  z.object({ kind: z.literal("projects") }),
  z.object({ kind: z.literal("plan") }),
]);
export type ChangeEvent = z.infer<typeof ChangeEvent>;

/** 에러 응답 (slug 미해소 404 등). */
export const ApiError = z.object({
  error: z.string(),
});
export type ApiError = z.infer<typeof ApiError>;

// ── 계획(개발 순서) — INV-5 가 저장을 허락하는 유일한 종류의 값 ──────────
// `docs/features/development-order/` 티켓 01·02. gootte 자기 저장소, 덮어쓰기만(이력 테이블 없음).

// 🔴 티켓 "종류"(계획·틈틈이·순서밖)는 없다. 캡틴이 안 하기로 정하셨고 그 낱말도 안 쓴다
// (2026-08-11). 순서와 병렬은 **트랙과 단계만으로** 표현된다 — 손잡이를 하나 더 두면
// 아무 일도 안 하면서 뜻만 흐려진다. 되살리지 마라(spec §종류는 두지 않는다).

/**
 * 기능 하나의 트랙·순위 — `feature_order` 표 1행. `why` 는 필수(빈 문자열이면 숫자만 남아
 * 착지 한 번에 무의미해진다). `whyNeedsReview` 는 드래그(티켓 04)가 순위만 바꾸고 `why` 는
 * 안 건드릴 때 붙는 표시 — 이 티켓(01·02)의 CLI 경로에서는 항상 false.
 */
export const FeatureOrderEntry = z.object({
  project: z.string(),
  feature: z.string(),
  track: z.string(),
  rank: z.number(), // 성기게(10·20·30) — 강제하지 않는다, planner 의 습관이다
  why: z.string().min(1),
  whyNeedsReview: z.boolean().default(false),
  updatedAt: z.string(), // ISO — 덮어쓴 시각
});
export type FeatureOrderEntry = z.infer<typeof FeatureOrderEntry>;

/**
 * 티켓 하나의 단계 — `ticket_order` 표 1행. **단계**(`step`) 하나로 순서와 병렬을 함께 적는다
 * (같은 단계 = 병렬, 다르면 순서 — spec §모델). 의존 관계는 여기 없다 — 티켓의 `Blocked by:` 가 SoT.
 */
export const TicketOrderEntry = z.object({
  project: z.string(),
  feature: z.string(),
  ticket: z.string(), // 티켓 번호("01") — `FeatureTicket.num` 과 같은 값
  step: z.number().int(),
  why: z.string().min(1),
  // `whyNeedsReview` 는 드래그(티켓 04)가 단계만 바꾸고 `why` 는 안 건드릴 때 붙는 표시 —
  // CLI(`set`) 경로에서는 항상 false(FeatureOrderEntry 와 같은 관례).
  whyNeedsReview: z.boolean().default(false),
  updatedAt: z.string(),
});
export type TicketOrderEntry = z.infer<typeof TicketOrderEntry>;

/** `order` 응답 — 적힌 계획을 그대로. 어긋남은 티켓 02 가 곱해 얹는다. */
export const PlanOrder = z.object({
  project: z.string(),
  features: z.array(FeatureOrderEntry),
  tickets: z.array(TicketOrderEntry),
});
export type PlanOrder = z.infer<typeof PlanOrder>;

// ── extra — 티켓 밖에서 더 개발된 것을 잡는 큐(development-order/05) ──────────
// 덮어쓰기(위)와 다르게 **소비하는 큐** — `done` 은 표시일 뿐 지우지 않는다.

/** `extra` 표 1행 — gootte 자기 저장소, 처리 표시로 소비한다. */
export const ExtraEntry = z.object({
  id: z.number().int(),
  project: z.string(),
  feature: z.string(), // 더 개발된 쪽(낡아지는 쪽) 기능 slug
  ticket: z.string(), // 그 기능의 티켓 번호
  note: z.string().min(1), // 무엇이 더 개발됐나 — verbatim, 요약하지 않는다(INV-4)
  who: z.string().nullable(), // 남긴 사람/에이전트 — 없어도 된다
  done: z.boolean(), // 처리 표시. 지우지 않는다
  createdAt: z.string(), // ISO
});
export type ExtraEntry = z.infer<typeof ExtraEntry>;

/**
 * `extra` 목록에 얹는 계산값 — **저장하지 않는다**(INV-1). 가리키는 티켓이 지금 문서에
 * 있는지는 읽을 때마다 다시 확인한다. 없어도 거절하지 않고 이 값으로 표시만 한다.
 */
export const ExtraListItem = ExtraEntry.extend({
  ticketExists: z.boolean(),
});
export type ExtraListItem = z.infer<typeof ExtraListItem>;

/**
 * 계획(DB)과 티켓(관리대상 md)의 어긋남 — 감추지 않는다(spec §어긋남은 감추지 않는다).
 * - `ticket_without_step` — 티켓 문서는 있는데 계획에 단계가 없다(새로 썼는데 안 넣음)
 * - `step_without_ticket` — 계획엔 단계가 있는데 티켓 문서가 없다(사라졌거나 번호가 바뀜)
 * - `done_but_staged` — 티켓은 이미 끝났는데(`done`·`dropped`) 계획엔 아직 단계로 남아 있다
 * - `blocked_by_unreadable` — `Blocked by:` 줄에 번호도 "없음" 도 못 알아들은 산문이 있다
 *   (development-order/11) — 막지는 않되, 못 읽었다는 사실 자체를 드러낸다
 */
export const PlanMismatchKind = z.enum([
  "ticket_without_step",
  "step_without_ticket",
  "done_but_staged",
  "blocked_by_unreadable",
]);
export type PlanMismatchKind = z.infer<typeof PlanMismatchKind>;

export const PlanMismatch = z.object({
  kind: PlanMismatchKind,
  feature: z.string(),
  ticket: z.string().optional(),
  step: z.number().optional(),
  detail: z.string(), // 사람이 읽는 한 줄 — 계산된 값이라 여기서 조립한다(요약 아님, 사실 나열)
});
export type PlanMismatch = z.infer<typeof PlanMismatch>;

/**
 * `next` 가 트랙별로 빈 이유 — 그냥 빈 목록은 "할 일이 없다" 와 "전부 막혔다" 를 구분 못 한다
 * (spec §next 의 정의). `mixed` = 막힘과 임자 있음이 섞여 어느 한쪽으로 못 몬다.
 */
export const NextEmptyReason = z.enum([
  "all_blocked",
  "all_claimed",
  "mixed",
  "no_steps",
  "all_done",
]);
export type NextEmptyReason = z.infer<typeof NextEmptyReason>;

export const NextTicket = z.object({
  feature: z.string(),
  ticket: z.string(),
  title: z.string(),
  why: z.string(), // 계획에 적힌 왜 — verbatim 릴레이(INV-4), 요약하지 않는다
});
export type NextTicket = z.infer<typeof NextTicket>;

/** 트랙 하나의 "지금 나란히 보낼 수 있는 것" — `tickets` 가 비면 `emptyReason` 이 왜인지 말한다. */
export const NextTrack = z.object({
  track: z.string(),
  step: z.number().nullable(), // 이 트랙에 계획된 단계가 없으면 null
  tickets: z.array(NextTicket),
  emptyReason: NextEmptyReason.nullable(), // tickets 가 있으면 null
});
export type NextTrack = z.infer<typeof NextTrack>;

export const NextResult = z.object({
  tracks: z.array(NextTrack),
  mismatches: z.array(PlanMismatch),
});
export type NextResult = z.infer<typeof NextResult>;

// ── 판단 요청(ask, 티켓 06) — 캡틴이 의견을 청하고 답을 그 자리에서 본다 ──────────
// `opinion_request` 표. `extra`(위)와 같은 규약 — 소비하는 큐, 있을 때만 한 줄, 없으면 침묵.

/**
 * 버튼이 뜨는 조건 셋(spec 06 §인지는 자동, 전달은 버튼) — 기계가 매 읽기 계산한다(INV-1).
 * `ticket_crossed` = 한 기능의 티켓 사이에 다른 기능이 끼어들었다.
 * `new_parallel` = 서로 다른 기능의 티켓이 같은 단계에 놓였다.
 * `why_flipped` = 드래그(티켓 04)가 `왜` 를 확인 필요로 세웠다 — 새 판정이 아니라 그 표시를 그대로 읽는다.
 */
export const OpinionTriggerKind = z.enum(["ticket_crossed", "new_parallel", "why_flipped"]);
export type OpinionTriggerKind = z.infer<typeof OpinionTriggerKind>;

/**
 * 판단이 필요한 자리 하나 — **저장하지 않는다**(INV-1, 04 의 즉시 검사와 같은 성격이지만 다른 판정 자리).
 * `detail` 이 그대로 버튼을 눌렀을 때의 "물음" 이 된다 — 기계가 아는 사실을 verbatim 으로 얹을 뿐,
 * 캡틴이 무엇을 물어야 할지 안 정하셔도 된다.
 */
export const OpinionTrigger = z.object({
  kind: OpinionTriggerKind,
  feature: z.string().nullable(),
  step: z.number().int().nullable(),
  detail: z.string(),
});
export type OpinionTrigger = z.infer<typeof OpinionTrigger>;

/**
 * `opinion_request` 표 1행 — gootte 자기 저장소, 처리 표시로 소비한다(`extra` 와 같은 성격, 지우지 않는다).
 * `batchSummary` 는 버튼을 누른 **그 순간의 배치**(verbatim 스냅샷) — 나중에 더 끄셔도 planner 가
 * 무엇에 대해 답하는지 흔들리지 않는다. `answer` 는 planner 가 `ask answer` 로 적은 그대로 싣는다 —
 * 요약하지 않는다(INV-4).
 */
export const OpinionRequest = z.object({
  id: z.number().int(),
  project: z.string(),
  batchSummary: z.string().min(1),
  question: z.string().min(1),
  answer: z.string().nullable(),
  done: z.boolean(), // 답이 달리면 true — 처리 표시일 뿐 지우지 않는다
  updatedAt: z.string(),
});
export type OpinionRequest = z.infer<typeof OpinionRequest>;

/**
 * `plan` 탭(티켓 03) 응답 — 화면이 전체 개발 순서를 그리는 데 필요한 셋을 한 번에 싣는다.
 * `features` 는 막힘·착수 가능·완료가 **매 요청 재계산된** 값(INV-1·INV-3, `FeaturesResponse` 와 같은 파생).
 * `order` 는 gootte 가 저장한 계획(INV-5) 그대로. `next` 는 02 의 순수 함수 결과 — 화면은 이것을
 * 그대로 쓰고 다시 판정하지 않는다(spec §판정 자리는 하나뿐).
 * `askTriggers` 는 06 의 순수 함수가 매 요청 계산한 것(INV-1) — 버튼이 뜰 자리. `askRequests` 는
 * gootte 가 저장한 판단 요청/답 그대로(INV-5) — 처리·미처리 가리지 않고 함께 싣는다(그 배치 옆에 붙어야 한다).
 */
export const PlanResponse = z.object({
  project: z.string(),
  features: z.array(Feature).default([]),
  order: PlanOrder,
  next: NextResult,
  askTriggers: z.array(OpinionTrigger).default([]),
  askRequests: z.array(OpinionRequest).default([]),
});
export type PlanResponse = z.infer<typeof PlanResponse>;

// ── 드래그(티켓 04) — gootte 의 첫 쓰기 경로 ──────────────────────
// 놓는 순간 기계가 아는 것만, 즉시(spec §두 속도). planner 를 기다리지 않는다(INV-4).

/**
 * 드래그 놓는 순간의 네 검사(spec §놓는 순간). 캡틴의 결정을 되돌리지 않는다 — 알려줄 뿐이다.
 */
export const DragWarningKind = z.enum([
  "blocked_regression", // 이 티켓이 기다리는 것을 뒤 단계로 보냈다
  "already_done", // 완료된 티켓을 옮겼다
  "claimed", // 지금 누가 붙들고 있는 티켓의 자리를 바꿨다
  "stale_block_reason", // 기다린다고 적힌 것이 이미 착지했다
]);
export type DragWarningKind = z.infer<typeof DragWarningKind>;

export const DragWarning = z.object({
  kind: DragWarningKind,
  detail: z.string(), // 사람이 읽는 한 줄 — verbatim 릴레이(INV-4), 요약하지 않는다
});
export type DragWarning = z.infer<typeof DragWarning>;

/** 드래그 쓰기 응답 — 갱신된 계획 + 그 자리에서 뜨는 경고(비어 있을 수 있다). */
export const DragResult = z.object({
  order: PlanOrder,
  warnings: z.array(DragWarning),
});
export type DragResult = z.infer<typeof DragResult>;
