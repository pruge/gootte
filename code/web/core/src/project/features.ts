import type { Feature, FeatureDocNode, FeatureTicket, TodoStatus } from "@gootte/contract";
import { parseCrossFeatureRef, type FeatureSpecDoc, type NewTicketDoc, type TicketDoc } from "../parse/feature";

/**
 * 기능 폴더 하나에서 읽어온 문서들 — core-io 가 read 하고 core 파서가 구조로 만든 결과.
 * `spec` 이 없는 폴더도 온다(티켓만 있는 폴더). 그때 표제는 폴더명이다.
 * `tree` 는 폴더에 실제로 있는 것의 목록(issues 제외) — core-io 가 readdir 로 만든 그대로
 * 통과시킨다(계산 없음, 티켓 01 §설계 3).
 */
export interface FeatureDocs {
  slug: string;
  spec: FeatureSpecDoc | null;
  tickets: TicketDoc[];
  tree: FeatureDocNode[];
  /** `tickets/T<NN>.md` 신관례(T04) — 상태는 없다(백로그 조인이 나중에 얹는다). 없으면 빈 배열. */
  newTickets?: NewTicketDoc[];
}

/**
 * "01" 과 "1" 은 같은 티켓이다 — 비교는 숫자로. 번호가 아니면 null.
 * 🔴 느슨한 parseInt 를 쓰지 않는다 — "03번 이후" 같은 산문을 3번 티켓으로 읽으면 INV-4 위반이다.
 */
function numKey(num: string): number | null {
  return /^\d{1,3}$/.test(num) ? Number.parseInt(num, 10) : null;
}

/** 번호 오름차순, 번호 없는 파일은 뒤로(그다음 slug). */
function byNum(a: { num: string; slug: string }, b: { num: string; slug: string }): number {
  const [x, y] = [numKey(a.num), numKey(b.num)];
  if (x === null && y === null) return a.slug.localeCompare(b.slug);
  if (x === null) return 1;
  if (y === null) return -1;
  return x === y ? a.slug.localeCompare(b.slug) : x - y;
}

/**
 * `tickets/T<NN>.md` 신관례(T04) 한 장 → 계약 형태. 파일에는 상태가 없다 — `status: "pending"`,
 * `statusKnown: false` 는 "모른다" 를 뜻하지 "이슈 관례의 알 수 없는 상태" 를 뜻하지 않는다
 * (화면은 `docConvention` 으로 그 둘을 가른다). 백로그 조인은 `applyBacklogStatus` 가 나중에 얹는다.
 */
function toNewTicket(doc: NewTicketDoc, doneNums: ReadonlySet<number>, crossIndex: CrossFeatureIndex): FeatureTicket {
  // 옛 관례와 **같은 계산**을 거친다(T01) — `## Depends on` 은 같은 개념의 다른 표기일 뿐이다(F2).
  // 임자는 여기 없다(상태의 SoT 가 백로그라 claimed 도 문서에 없다).
  const waiting = waitingOn(doc.blockedBy, doneNums, crossIndex);
  return {
    num: doc.num,
    slug: doc.slug,
    path: doc.path,
    title: doc.title,
    status: "pending",
    sourceStatus: null,
    statusKnown: false,
    blockedBy: doc.blockedBy,
    unreadableBlockedBy: doc.unreadableBlockedBy,
    waitingOn: waiting,
    startable: waiting.length === 0,
    workedBy: [],
    needsCaptainEye: false,
    docConvention: "tickets",
    backlogStatus: null,
    backlogUrl: null,
  };
}

/** 기능 하나의 번호 현황 — 다른 기능의 티켓을 가리키는 선행을 풀 때 함께 쓰인다. */
export interface FeatureNums {
  /** 그 기능에 실재하는 티켓 번호 전부(있다/없다 판정용). */
  readonly all: ReadonlySet<number>;
  /** 그중 완료(`done`)인 것(해제 판정용). */
  readonly done: ReadonlySet<number>;
}

/** 기능 slug → 그 기능의 번호 현황. 다른 기능의 티켓을 가리키는 선행을 풀 때 찾아본다. */
export type CrossFeatureIndex = ReadonlyMap<string, FeatureNums>;

/**
 * 티켓 무리에서 번호 현황을 만든다 — 두 관례(`issues/`·`tickets/`)를 섞어 넘겨도 된다.
 * `buildCrossFeatureIndex` 와 백로그 조인 뒤의 재판정(backlog-join, INV-3)이 함께 쓴다.
 */
export function featureNums(tickets: readonly { num: string; status: TodoStatus }[]): FeatureNums {
  const all = new Set<number>();
  const done = new Set<number>();
  for (const t of tickets) {
    const n = numKey(t.num);
    if (n === null) continue;
    all.add(n);
    if (t.status === "done") done.add(n);
  }
  return { all, done };
}

/** 여러 기능 문서에서 `CrossFeatureIndex` 를 만든다 — `buildFeatures` 가 한 번 만들어 전체에 돌린다. */
function buildCrossFeatureIndex(docsList: readonly FeatureDocs[]): CrossFeatureIndex {
  const index = new Map<string, FeatureNums>();
  for (const docs of docsList) {
    // 🔴 신관례(`tickets/`, T01) 티켓의 번호도 같은 색인에 넣는다 — 안 그러면 신관례를
    // 가리키는/신관례가 거는 기능 간 참조가 "그 기능에 없다" 고 거짓말한다. 빌드 시점의
    // 신관례 상태는 언제나 백로그 조인 전(pending)이다 — 완료 재판정은 applyBacklogStatus 몫.
    index.set(
      docs.slug,
      featureNums([...docs.tickets, ...(docs.newTickets ?? []).map((t) => ({ ...t, status: "pending" as const }))]),
    );
  }
  return index;
}

/**
 * 막힘 해제 계산 — `Blocked by:` 에 나열된 번호가 **전부 완료(resolved)** 면 착수 가능(F5).
 * 파일 어디에도 그렇게 적혀 있지 않다. 볼 때마다 다시 계산하고 어디에도 저장하지 않는다(INV-1).
 *
 * - `wontfix` 선행은 해제하지 않는다 — 관례가 "전부 `resolved`" 라고 못박는다(issue-tracker §Blocked by).
 * - 존재하지 않는 번호를 가리키면 해제하지 않는다 — 완료를 증명할 수 없으므로 계속 기다린다(INV-4).
 *   그 번호는 `waitingOn` 에 그대로 남아 화면에서 보인다.
 * - 번호가 아닌 산문 선행(다른 기능의 티켓을 가리키는 문구)도 원칙적으로 해제하지 않고 문구 그대로
 *   남긴다 — 이 기능의 같은 숫자에 갖다 붙이는 추정이 INV-4 위반이다.
 * - 🔴 단, 그 산문이 markdown 링크로 **다른 기능의 실재하는 티켓**을 가리키면(경로에서 기능·번호를
 *   둘 다 읽는다, `parseCrossFeatureRef`) 추정이 필요 없다 — 그 티켓이 완료면 해제한다
 *   (cross-feature-blocker 티켓). 기능이 없다·티켓이 없다·경로가 애매하면 지금처럼 계속 막는다.
 */
function waitingOn(
  blockedBy: readonly string[],
  doneNums: ReadonlySet<number>,
  crossIndex: CrossFeatureIndex,
): string[] {
  return blockedBy.filter((b) => {
    const n = numKey(b);
    if (n !== null) return !doneNums.has(n);
    const ref = parseCrossFeatureRef(b);
    if (ref === null) return true;
    const refNum = numKey(ref.num);
    const target = refNum === null ? undefined : crossIndex.get(ref.feature);
    if (refNum === null || !target || !target.all.has(refNum)) return true;
    return !target.done.has(refNum);
  });
}

/** `waitingOn` 의 좁은 창구 — 백로그 조인 뒤의 신관례 재판정(`backlog-join`)이 함께 쓴다(INV-3). */
export function resolveWaitingOn(
  blockedBy: readonly string[],
  doneNums: ReadonlySet<number>,
  crossIndex: CrossFeatureIndex,
): string[] {
  return waitingOn(blockedBy, doneNums, crossIndex);
}

function toTicket(doc: TicketDoc, doneNums: ReadonlySet<number>, crossIndex: CrossFeatureIndex): FeatureTicket {
  const waiting = waitingOn(doc.blockedBy, doneNums, crossIndex);
  // 임자 있음 = 문서가 claimed 라고 말한다. 처리중을 만들지는 않는다(그건 applyInProgress 의 몫) —
  // 여기서는 착수 가능 판정에서만 뺀다(work-claims-its-ticket/01 §C).
  const claimed = doc.sourceStatus === "claimed";
  return {
    num: doc.num,
    slug: doc.slug,
    path: doc.path,
    title: doc.title,
    status: doc.status,
    sourceStatus: doc.sourceStatus,
    statusKnown: doc.statusKnown,
    ...(doc.completedAt ? { completedAt: doc.completedAt } : {}),
    blockedBy: doc.blockedBy,
    unreadableBlockedBy: doc.unreadableBlockedBy,
    waitingOn: waiting,
    // 착수 가능 = 선행이 모두 풀렸다 + 임자가 없다. 판정하는 자리는 여기 하나뿐이다.
    startable: waiting.length === 0 && !claimed,
    // 문서만으로는 언제나 빈 값 — 처리중은 격리 사본 관측이 얹는다(`applyInProgress`).
    workedBy: [],
    needsCaptainEye: doc.needsCaptainEye,
  };
}

/**
 * 기능 폴더 하나 → 계약 형태. 티켓은 번호순.
 * `crossIndex` 를 안 주면(단독 호출 — 대부분 테스트) 이 기능 자신만으로 만든 색인을 쓴다 —
 * 그러면 다른 기능을 가리키는 링크는 항상 "그 기능을 모른다" 가 되어 지금처럼 막힌 채 남는다.
 * `buildFeatures` 는 전체 문서로 만든 색인을 넘겨 기능을 넘는 선행도 풀 수 있게 한다.
 */
export function buildFeature(docs: FeatureDocs, crossIndex?: CrossFeatureIndex): Feature {
  // 완료 색인에도 두 관례를 섞는다 — 신관례 티켓이 구관례를, 구관례가 신관례를 선행으로
  // 가리킬 수 있으므로(T01). 빌드 시점엔 신관례 상태가 아직 백로그 조인 전(pending)이라
  // 실질은 구관례 쪽이 채우고, 조인 뒤의 재판정은 `applyBacklogStatus` 가 한다(INV-3).
  const doneNums = new Set<number>();
  for (const t of docs.tickets) {
    // 신관례는 이 시점엔 언제나 pending(백로그 조인 전)이라 done 이 나올 수 없다 — 주석은
    // 취지를 알리는 것이고 실제 필터는 구관례에만 의미가 있다.
    const n = numKey(t.num);
    if (n !== null && t.status === "done") doneNums.add(n);
  }
  const index = crossIndex ?? buildCrossFeatureIndex([docs]);
  return {
    slug: docs.slug,
    title: docs.spec?.title ?? docs.slug,
    status: docs.spec?.status ?? "pending",
    sourceStatus: docs.spec?.sourceStatus ?? null,
    statusKnown: docs.spec?.statusKnown ?? false,
    tickets: [...docs.tickets].sort(byNum).map((t) => toTicket(t, doneNums, index)),
    docs: docs.tree,
    newTickets: [...(docs.newTickets ?? [])].sort(byNum).map((t) => toNewTicket(t, doneNums, index)),
  };
}

/**
 * 남은 일이 있다 = **done 도 dropped 도 아닌 티켓이 하나라도 있다**(= 착수할 것이 남았다).
 * `in_progress` 는 여기 포함된다 — 붙들려 있는 것도 아직 안 끝난 일이다.
 *
 * 🔴 이 술어가 **하나뿐이어야 한다.** 카드 정렬과 사이드바의 "남은 일 있는 기능 수" 가 각자
 * 판정하면 그 순간부터 둘 중 하나가 거짓이 되고, 화면이 서로 다른 말을 한다.
 * `TicketDoc` 과 `FeatureTicket` 둘 다 `status` 를 가지므로 그 한 칸만 보고 판정한다.
 *
 * 🔴 **`planReopen`(`plan/close.ts`)은 더 이상 이 술어를 쓰지 않는다**(plan-board/11, 캡틴 결정
 * 2026-08-13) — 되돌리는 방아쇠가 "남은 일이 있나" 에서 "안 읽었나" 로 바뀌었다(spec §INV-B8,
 * `hasUnreadWork`). 이 함수는 `countOpenFeatures`(사이드바 집계)를 위해 export 된 채로 남는다.
 */
export function hasOpenWork(tickets: readonly { status: TodoStatus }[]): boolean {
  return tickets.some((t) => t.status !== "done" && t.status !== "dropped");
}

/**
 * 기능 하나의 티켓 전부 — `issues/`(구관례, `tickets`)와 `tickets/`(신관례, `newTickets`)를
 * 합친다. 두 관례는 상태의 SoT 가 다르지만(계산 경로를 안 섞는다, contract 주석), "얼마나
 * 남았나" 는 관례를 안 가리는 질문이다 — 여기서 합치지 않으면 `tickets/` 만 쓰는 기능이 카드
 * 머리글·정렬·사이드바 집계에서 전부 0/빈 무리로 보인다(실제 결함, 2026-08-25 캡틴 보고).
 */
export function allTickets(f: Feature): FeatureTicket[] {
  return [...f.tickets, ...(f.newTickets ?? [])];
}

/**
 * 남은 일이 있는 기능의 수 — 목록 뷰가 "이 프로젝트에 할 일이 몇 갈래 남았나" 로 쓴다.
 * 정렬 맨 앞 무리(`RANK_OPEN`)의 크기와 **정의상 같다**(같은 술어를 쓴다).
 * 티켓이 0개인 기능은 세지 않는다 — 착수할 것이 없다(그래서 정렬에서도 앞 무리가 아니다).
 */
export function countOpenFeatures(features: readonly Feature[]): number {
  return features.filter((f) => hasOpenWork(allTickets(f))).length;
}

/**
 * 기능 목록 → 계약 형태. **정렬하지 않는다** — 정렬은 처리중이 얹힌 뒤,
 * `sortFeatures`(아래) 한 곳에서만 일어난다(§sortFeatures 참조).
 * 기능 자신의 `status`(spec)는 쓰지 않는다 — 판정은 오직 티켓으로 한다.
 */
export function buildFeatures(docs: FeatureDocs[]): Feature[] {
  const crossIndex = buildCrossFeatureIndex(docs);
  return docs.map((d) => buildFeature(d, crossIndex));
}

/** 정렬 계층 — 작을수록 위. 세 무리의 순서 자체가 이 상수들의 값이다. */
const RANK_OPEN = 0; // 착수할 티켓이 남았다
const RANK_NO_TICKETS = 1; // 티켓이 없다 — 착수할 것도, 끝났다는 증거도 없다
const RANK_DONE = 2; // 티켓이 전부 done/dropped 다

/**
 * 기능 하나의 무리(1단계).
 *
 * 🔴 **티켓이 0개인 기능은 "남은 일 있음" 이 아니다** — "남은 일" 은 지금 착수할 것이 남았다는
 * 뜻이고, 티켓이 없으면 착수할 것이 없다. 이것을 맨 위 무리에 끼우면 기능이 늘수록 진짜 남은
 * 일을 스크롤해 찾아야 한다(캡틴 피드백) — 위로 올리는 이유가 사라진다.
 *
 * 그렇다고 완료 무리로 접지도 않는다 — **끝났다는 증거가 없다.** 완료로 접으면 화면이
 * "이 기능은 끝났다" 고 거짓말한다. 그래서 둘 사이, 자기 무리에 둔다.
 */
function rank(tickets: readonly { status: TodoStatus }[]): number {
  if (tickets.length === 0) return RANK_NO_TICKETS;
  return hasOpenWork(tickets) ? RANK_OPEN : RANK_DONE;
}

/**
 * 처리중인 티켓이 하나라도 있는가(2단계, 티켓 03).
 * `in_progress` 는 격리 사본 관측(`applyInProgress`)만 붙인다 — 여기서는 이미 계산된 값을
 * 읽기만 한다(INV-1). done/dropped 티켓엔 절대 안 붙으므로, 이 값이 참이면 그 기능은
 * 반드시 `RANK_OPEN` 무리다(그래서 무리를 건드리지 않고 무리 "안" 에서만 앞세울 수 있다).
 */
function hasInProgress(tickets: readonly { status: TodoStatus }[]): boolean {
  return tickets.some((t) => t.status === "in_progress");
}

/**
 * 기능 목록 정렬 — **여기 한 곳에서만 일어난다**(티켓 03). 세 단계:
 *
 * 1. 무리 — 남은 일 있음(`RANK_OPEN`) → 티켓 없음(`RANK_NO_TICKETS`) → 전부 완료(`RANK_DONE`)
 * 2. 처리중인 티켓이 있는가 — 있는 쪽이 같은 무리 안에서 먼저(캡틴 지시, 2026-08-10)
 * 3. 폴더명(`slug`) — 개수가 아니라 이름으로. 2단계는 있다/없다만 보고, 개수로 줄 세우면
 *    사본 하나가 티켓 여럿을 건드릴 때 순서가 널뛴다.
 *
 * 🔴 이 함수는 **처리중이 이미 얹힌** `Feature[]` 를 받는다 — `buildFeatures` 는 문서만 보고
 * 끝나 처리중을 아직 모른다(`applyInProgress` 가 나중이다). 그래서 정렬은 `buildFeatures` 가
 * 아니라 `applyInProgress` 가 사실을 다 모은 뒤 호출한다.
 */
export function sortFeatures(features: readonly Feature[]): Feature[] {
  return [...features].sort((a, b) => {
    const rankDiff = rank(allTickets(a)) - rank(allTickets(b));
    if (rankDiff !== 0) return rankDiff;
    const wipDiff = Number(hasInProgress(allTickets(b))) - Number(hasInProgress(allTickets(a)));
    return wipDiff !== 0 ? wipDiff : a.slug.localeCompare(b.slug);
  });
}
