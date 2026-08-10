import type { Feature, FeatureDocNode, FeatureTicket, TodoStatus } from "@gootte/contract";
import type { FeatureSpecDoc, TicketDoc } from "../parse/feature";

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
}

/**
 * "01" 과 "1" 은 같은 티켓이다 — 비교는 숫자로. 번호가 아니면 null.
 * 🔴 느슨한 parseInt 를 쓰지 않는다 — "03번 이후" 같은 산문을 3번 티켓으로 읽으면 INV-4 위반이다.
 */
function numKey(num: string): number | null {
  return /^\d{1,3}$/.test(num) ? Number.parseInt(num, 10) : null;
}

/** 번호 오름차순, 번호 없는 파일은 뒤로(그다음 slug). */
function byNum(a: TicketDoc, b: TicketDoc): number {
  const [x, y] = [numKey(a.num), numKey(b.num)];
  if (x === null && y === null) return a.slug.localeCompare(b.slug);
  if (x === null) return 1;
  if (y === null) return -1;
  return x === y ? a.slug.localeCompare(b.slug) : x - y;
}

/**
 * 막힘 해제 계산 — `Blocked by:` 에 나열된 번호가 **전부 완료(resolved)** 면 착수 가능(F5).
 * 파일 어디에도 그렇게 적혀 있지 않다. 볼 때마다 다시 계산하고 어디에도 저장하지 않는다(INV-1).
 *
 * - `wontfix` 선행은 해제하지 않는다 — 관례가 "전부 `resolved`" 라고 못박는다(issue-tracker §Blocked by).
 * - 존재하지 않는 번호를 가리키면 해제하지 않는다 — 완료를 증명할 수 없으므로 계속 기다린다(INV-4).
 *   그 번호는 `waitingOn` 에 그대로 남아 화면에서 보인다.
 * - 번호가 아닌 산문 선행(다른 기능의 티켓을 가리키는 문구)도 해제하지 않고 문구 그대로 남긴다 —
 *   이 기능의 같은 숫자에 갖다 붙이는 추정이 INV-4 위반이다. 사람이 읽어 판단하도록 드러낸다.
 */
function waitingOn(ticket: TicketDoc, doneNums: ReadonlySet<number>): string[] {
  return ticket.blockedBy.filter((b) => {
    const n = numKey(b);
    return n === null || !doneNums.has(n);
  });
}

function toTicket(doc: TicketDoc, doneNums: ReadonlySet<number>): FeatureTicket {
  const waiting = waitingOn(doc, doneNums);
  // 임자 있음 = 문서가 claimed 라고 말한다. 처리중을 만들지는 않는다(그건 applyInProgress 의 몫) —
  // 여기서는 착수 가능 판정에서만 뺀다(work-claims-its-ticket/01 §C).
  const claimed = doc.sourceStatus === "claimed";
  return {
    num: doc.num,
    slug: doc.slug,
    title: doc.title,
    status: doc.status,
    sourceStatus: doc.sourceStatus,
    statusKnown: doc.statusKnown,
    ...(doc.completedAt ? { completedAt: doc.completedAt } : {}),
    blockedBy: doc.blockedBy,
    waitingOn: waiting,
    // 착수 가능 = 선행이 모두 풀렸다 + 임자가 없다. 판정하는 자리는 여기 하나뿐이다.
    startable: waiting.length === 0 && !claimed,
    // 문서만으로는 언제나 빈 값 — 처리중은 격리 사본 관측이 얹는다(`applyInProgress`).
    workedBy: [],
  };
}

/** 기능 폴더 하나 → 계약 형태. 티켓은 번호순. */
export function buildFeature(docs: FeatureDocs): Feature {
  const doneNums = new Set<number>();
  for (const t of docs.tickets) {
    const n = numKey(t.num);
    if (n !== null && t.status === "done") doneNums.add(n);
  }
  return {
    slug: docs.slug,
    title: docs.spec?.title ?? docs.slug,
    status: docs.spec?.status ?? "pending",
    sourceStatus: docs.spec?.sourceStatus ?? null,
    statusKnown: docs.spec?.statusKnown ?? false,
    tickets: [...docs.tickets].sort(byNum).map((t) => toTicket(t, doneNums)),
    docs: docs.tree,
  };
}

/**
 * 남은 일이 있다 = **done 도 dropped 도 아닌 티켓이 하나라도 있다**(= 착수할 것이 남았다).
 * `in_progress` 는 여기 포함된다 — 붙들려 있는 것도 아직 안 끝난 일이다.
 *
 * 🔴 이 술어가 **하나뿐이어야 한다.** 카드 정렬과 사이드바의 "남은 일 있는 기능 수" 가 각자
 * 판정하면 그 순간부터 둘 중 하나가 거짓이 되고, 화면이 서로 다른 말을 한다.
 * `TicketDoc` 과 `FeatureTicket` 둘 다 `status` 를 가지므로 그 한 칸만 보고 판정한다.
 */
function hasOpenWork(tickets: readonly { status: TodoStatus }[]): boolean {
  return tickets.some((t) => t.status !== "done" && t.status !== "dropped");
}

/**
 * 남은 일이 있는 기능의 수 — 목록 뷰가 "이 프로젝트에 할 일이 몇 갈래 남았나" 로 쓴다.
 * 정렬 맨 앞 무리(`RANK_OPEN`)의 크기와 **정의상 같다**(같은 술어를 쓴다).
 * 티켓이 0개인 기능은 세지 않는다 — 착수할 것이 없다(그래서 정렬에서도 앞 무리가 아니다).
 */
export function countOpenFeatures(features: readonly Feature[]): number {
  return features.filter((f) => hasOpenWork(f.tickets)).length;
}

/**
 * 기능 목록 → 계약 형태. **정렬하지 않는다** — 정렬은 처리중이 얹힌 뒤,
 * `sortFeatures`(아래) 한 곳에서만 일어난다(§sortFeatures 참조).
 * 기능 자신의 `status`(spec)는 쓰지 않는다 — 판정은 오직 티켓으로 한다.
 */
export function buildFeatures(docs: FeatureDocs[]): Feature[] {
  return docs.map(buildFeature);
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
    const rankDiff = rank(a.tickets) - rank(b.tickets);
    if (rankDiff !== 0) return rankDiff;
    const wipDiff = Number(hasInProgress(b.tickets)) - Number(hasInProgress(a.tickets));
    return wipDiff !== 0 ? wipDiff : a.slug.localeCompare(b.slug);
  });
}
