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
  // (development-order/11). 어긋남 목록에 올리던 계산(`computeMismatches`)은 plan-board/01 이 걷어냈다.
  unreadableBlockedBy: z.array(z.string()).default([]),
  waitingOn: z.array(z.string()).default([]), // 그중 아직 완료가 아닌 것 — 계산
  // 착수 가능 = waitingOn 이 비었고 + 임자(claimed)가 없다 — 계산이지 파일에 적힌 값이 아니다(INV-1).
  // 판정하는 자리는 여기 하나뿐이다 — 머리글 집계와 줄 표시가 이 값을 그대로 센다(같은 결함을 반복하지 않는다).
  startable: z.boolean(),
  // 이 티켓을 지금 붙들고 있는 격리 사본의 브랜치 이름(verbatim). 관측 파생이라 파일에 없다.
  // 한 티켓을 두 사본이 붙들면 원소 둘 — 그래도 티켓은 하나로 센다.
  workedBy: z.array(z.string()).default([]),
  // 티켓 문서에 `## 캡틴 확인` 절이 있는가 — 절 존재만으로 정한다(INV-4, development-order/15 ②).
  // "— 없음" 접미(캡틴이 이미 필요 없다고 결정하신 절)는 필요로 세지 않는다.
  needsCaptainEye: z.boolean(),
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

// ── 계획 판(plan-board) — 다섯 자리 ──────────────────────
// 옛 배선(트랙·순위·왜·어긋남·드래그 경고·extra 큐)은 여기 있었고 plan-board/01 이 걷어냈다.
// 아래가 그 자리에 서는 다섯 자리 모델이다(docs/features/plan-board/spec.md §저장 형태).

/**
 * `placement` 표에 **저장되는** 자리 넷.
 *
 * 🔴 **대기가 이 목록에 없는 것이 설계다.** 자리 행이 없다는 것이 곧 대기이고(spec §다섯 자리),
 * 대기를 뜻하는 값을 이 칸에 두는 순간 "행 없음" 과 "값이 대기" 라는 **같은 뜻의 두 표현**이 생겨
 * 반드시 갈라진다. 그래서 등록이라는 행위가 없고, 없는 행위는 빠뜨릴 수 없다(INV-B1).
 */
export const PlanArea = z.enum(["active", "reserved", "discarded", "done"]);
export type PlanArea = z.infer<typeof PlanArea>;

/**
 * `placement` 표 한 줄 — 캡틴이 정한 것과 gootte 가 닫으며 적은 것뿐이다(INV-5).
 * 🔴 **문서를 다시 읽어 같은 값이 나오는 것은 하나도 없다** — 제목·티켓·상태·완료 여부는 전부
 * 매 요청 문서에서 다시 온다. 그래서 이 표와 문서는 갈라질 두 축이 되지 않는다(spec §신선함).
 */
export const Placement = z.object({
  feature: z.string(), // 기능 폴더명
  area: PlanArea,
  seq: z.number().int(), // 작업 대상 안에서의 카드 순서
  closedAt: z.string().nullable().default(null), // 완료 칸에 들어간 시각(날짜+시간). 문서엔 날짜뿐이라 저장 자격이 있다(F6)
});
export type Placement = z.infer<typeof Placement>;

/**
 * 판 위의 카드 하나 = **기능 문서**(제목·티켓 — 매 요청 다시 읽는다, INV-5) + 캡틴이 정한 것(`seq`·`closedAt`).
 *
 * 🔴 카드는 **자기 자리를 값으로 들고 있지 않다.** 어느 칸에 담겨 있는가가 곧 그 카드의 자리다 —
 * 카드에 `area` 를 실으면 대기 카드가 실을 값이 없어 다시 "대기" 라는 값을 발명하게 된다.
 */
export const PlanCard = z.object({
  feature: Feature,
  seq: z.number().int().nullable().default(null), // 자리 행이 없으면 null
  closedAt: z.string().nullable().default(null),
  /**
   * 티켓 slug → 화면에 보일 단계(당김까지 끝난 값, plan-board/05). **작업 대상 카드에만 값이 있다**
   * — 단계는 작업 대상에 있는 동안만 존재한다(spec §단계는 잠시 붙었다 사라지는 것이다).
   * 값이 없는 티켓(빈 단계로 당겨져 사라졌거나 애초에 단계 행이 없는 티켓)은 이 표에 없다.
   */
  steps: z.record(z.string(), z.number().int()).optional(),
});
export type PlanCard = z.infer<typeof PlanCard>;

/**
 * 다섯 칸 — `plan` 탭이 그대로 그린다. 위에 **작업 대상**(`active`) 하나, 아래에
 * **대기 · 예약 · 폐기 · 완료** 네 탭(spec §모델, 티켓 02 §만드는 것).
 *
 * 🔴 `waiting` 은 저장된 것이 아니다 — **자리 행이 없는 기능 전부**다. 서버도 화면도 이 값을
 * 저장하지 않고, 볼 때마다 문서 목록과 자리 행에서 다시 갈라 낸다(INV-1·INV-3).
 */
export const PlanBoardResponse = z.object({
  project: z.string(),
  waiting: z.array(PlanCard).default([]),
  active: z.array(PlanCard).default([]),
  reserved: z.array(PlanCard).default([]),
  discarded: z.array(PlanCard).default([]),
  done: z.array(PlanCard).default([]),
});
export type PlanBoardResponse = z.infer<typeof PlanBoardResponse>;

/**
 * 카드를 옮긴다(plan-board/03) — **캡틴의 손이 유일한 입구**다.
 * 자리를 옮기는 CLI 는 두지 않으므로(spec §자리를 옮기는 명령은 두지 않는다) 이 요청 하나가
 * `placement` 표에 닿는 유일한 길이다.
 *
 * 🔴 **놓을 때 검사하지 않는다**(INV-B3). 여기에는 "옮겨도 되는가" 를 묻는 칸이 없다 —
 * 캡틴이 놓은 자리가 곧 정답이고, 옛 판의 드래그 경고 넷은 01 이 걷어냈다.
 * 🔴 **이유를 받는 칸도 없다.** 남은 티켓을 안고 완료로 옮겨도 묻지 않는다(캡틴 결정) —
 * 왜 남기고 닫았는지는 그 티켓 문서에 적힌다.
 */
export const PlanMoveRequest = z.object({
  /** 옮길 기능들 — 캡틴이 집은 순서 그대로. 여러 장 한 번에 간다(캡틴 제안 2 "여러개 가능"). */
  features: z.array(z.string().min(1)).min(1),
  /**
   * 목적지. 🔴 **`null` 이 대기다** — 대기를 뜻하는 값을 만들지 않는다(INV-B1).
   * 대기로 보내는 일은 자리 행을 **지우는** 것이라 애초에 저장할 값이 없다.
   */
  area: PlanArea.nullable(),
  /** 목적지 칸에서 끼워 넣을 자리 — 옮길 카드들을 뺀 나머지 기준 0-based. 넘치면 맨 뒤. */
  index: z.number().int().nonnegative().default(0),
});
export type PlanMoveRequest = z.infer<typeof PlanMoveRequest>;
