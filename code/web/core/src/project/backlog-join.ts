import type { Feature, FeatureTicket, TodoStatus } from "@gootte/contract";
import { featureNums, hasOpenWork, resolveWaitingOn, type CrossFeatureIndex } from "./features";
import type { BacklogTaskDoc } from "../parse/backlog";
import { elapsedPhrase } from "../parse/elapsed";

/**
 * `tickets/T<NN>.md` 신관례 티켓 ↔ firstmate 홈 백로그 조인(T04). 상태의 단일 출처는 백로그다
 * (spec D4 사관장 확정 b안) — 파일에는 상태가 없다. 순수·결정적(INV-4).
 */

const SECTION_STATUS: Readonly<Record<BacklogTaskDoc["section"], TodoStatus>> = {
  in_flight: "in_progress",
  queued: "pending",
  done: "done",
};

export interface BacklogJoin {
  status: TodoStatus;
  url: string | null;
  completedAt: string | null; // done 일 때만 채운다 — 백로그의 `(merged|done: ...)` verbatim
  // T01(a-ticket-tells-how-long-it-took) — 걸린 시간 어림 문구(`elapsedPhrase`). 모르면 없음
  // (undefined) — `time:` 줄이 없거나 파싱 실패면 지어내지 않는다(INV-4).
  elapsed?: string;
}

/**
 * 자식 id 모양 — D4 규약의 `<parent>-t<NN>`. 자식 메모도 자기 티켓 경로를 인용하므로 needle 이
 * 반드시 걸린다. 자식은 부모 후보가 아니다(every-home-reports-its-status T01).
 */
const CHILD_ID = /-t\d+$/;

/**
 * `<id>-t<NN>` 자식 행을 실제로 가진 후보인가 — 백로그에 그 모양의 행이 존재하는지로만 판정한다
 * (추측·유사성 없음, INV-4). 자식 메모도 티켓 경로를 인용하므로 `CHILD_ID` 배제와 함께 쓴다.
 */
function hasChildRow(tasks: readonly BacklogTaskDoc[], id: string): boolean {
  return tasks.some((t) => t.id.startsWith(`${id}-t`) && CHILD_ID.test(t.id));
}

/**
 * 부모 작업 id 찾기 — `(repo: <repo>)` 가 같고, 메모 안에 `docs/features/<slug>/` 문구가 있는
 * 작업(task-planning.md §Parent/child identity: 부모의 백로그 메모가 `<project>:<feature-slug>`
 * 쌍을 담는다). **자식 id 모양(`<무엇>-t<숫자>`)은 후보에서 배제**하고(두 방어는 서로 다른 사고를
 * 막는다), 다른 작업의 산문이 그 경로를 인용해 후보로 잘못 걸리는 일은 **실제 자식 행 보유**로
 * 갈라낸다 — 자식(`${id}-t<NN>`)을 가진 후보만 남기되 그중에서도 목록에서 먼저 오는 것을 쓴다
 * (호출자·홈 병합, T02 는 지도부 홈 항목을 앞에 놓을 계약이다). 자식을 가진 후보가 하나도 없으면
 * 기획 직후처럼 자식 행이 아직 없는 경우를 지키기 위해 기존 규칙대로 선착순 첫 후보를 쓴다.
 * 후보가 없으면 null — 추측하지 않는다. 순수·결정적(INV-4).
 */
function findParentId(tasks: readonly BacklogTaskDoc[], repo: string, featureSlug: string): string | null {
  const needle = `docs/features/${featureSlug}/`;
  const candidates = tasks.filter((t) => t.repo === repo && !CHILD_ID.test(t.id) && t.note.includes(needle));
  if (candidates.length === 0) return null;
  return candidates.find((c) => hasChildRow(tasks, c.id))?.id ?? candidates[0]?.id ?? null;
}

/**
 * 티켓 번호 하나 → 조인 결과. `<parent>-t<NN>` id 규약(grill.md D4)으로 자식 작업을 찾는다.
 * 부모를 못 찾거나 자식 id 가 없으면 null — 조인 실패는 "상태 미표시" 로만 드러난다(추측 금지).
 */
export function joinTicketBacklog(
  tasks: readonly BacklogTaskDoc[],
  repo: string,
  featureSlug: string,
  ticketNum: string,
  // T01 — 진행 중 어림에 쓰는 현재 시각(ISO 8601). 호출자가 준다(테스트가 시계에 흔들리지
  // 않게, spec §구현 노트) — 기본값은 기존 호출자(다수 테스트·app.ts)를 안 깨기 위함이다.
  now: string = new Date().toISOString(),
): BacklogJoin | null {
  if (!ticketNum) return null;
  const parentId = findParentId(tasks, repo, featureSlug);
  if (!parentId) return null;
  const childId = `${parentId}-t${ticketNum.padStart(2, "0")}`;
  const task = tasks.find((t) => t.id === childId);
  if (!task) return null;
  const status = SECTION_STATUS[task.section];
  const elapsed = elapsedPhrase(task.startedAt, task.finishedAt, now) ?? undefined;
  return {
    status,
    url: task.url,
    completedAt: status === "done" ? task.since : null,
    ...(elapsed ? { elapsed } : {}),
  };
}

function joinTicket(
  ticket: FeatureTicket,
  tasks: readonly BacklogTaskDoc[],
  repo: string,
  featureSlug: string,
  now: string,
): FeatureTicket {
  const join = joinTicketBacklog(tasks, repo, featureSlug, ticket.num, now);
  if (!join) return ticket;
  return {
    ...ticket,
    status: join.status,
    backlogStatus: join.status,
    backlogUrl: join.url,
    ...(join.completedAt ? { completedAt: join.completedAt } : {}),
    ...(join.elapsed ? { elapsed: join.elapsed } : {}),
  };
}

// ── 머리글 배지 파생(the-header-agrees-with-its-tickets/T01) ───────────────────

/**
 * 신관례(`tickets/`) 기능의 머리글 상태 배지 — **티켓 상태에서 파생한다**(D2). 손으로 쓴
 * `spec.md` 의 `Status:` 줄은 출처가 아니다 — 앞의 네 수(`counts()`)와 같은 입력에서 나와야
 * 같은 줄이 자기모순하지 않는다. 순수·결정적(INV-4), 어디에도 저장하지 않는다(INV-1).
 *
 * - 🔴 **판정 술어를 새로 만들지 않는다** — 처리중 = `in_progress` 존재, 완료 = 티켓이 있고
 *   `hasOpenWork` 가 거짓(`featureFullyChecked` 와 같은 계산). 그 외는 남음.
 * - 🔴 **조인 실패는 추측하지 않는다**(D5) — 티켓 하나라도 백로그에 조인되지 않아 상태를
 *   모르면 null(배지를 안 띄운다). `isUnjoinedNewTicket`(TicketRow)이 티켓 줄에서 지키는
 *   규율과 같다. 조인 실패를 "착수 가능" 이나 "완료" 로 읽는 것은 INV-4 위반이다.
 * - 🔴 **구관례(`issues/`)는 여기서 다루지 않는다** — 티켓 목록이 비으면 null 이고 호출자는
 *   기능을 그대로 둔다. 그쪽 배지는 문서 줄 verbatim 이고 문서가 SoT 이므로 지금이 옳다(D2).
 */
export interface FeatureHeaderBadge {
  status: TodoStatus;
  sourceStatus: string;
  statusKnown: true;
}

/** 신관례 티켓 무리 → 머리글 배지. 구관례(빈 목록)·조인 실패는 null — 배지를 띄우지 않는다. */
export function deriveHeaderBadge(tickets: readonly FeatureTicket[]): FeatureHeaderBadge | null {
  if (tickets.length === 0) return null; // 구관례 — 문서가 SoT, 지금 그대로(D2)
  // 하나라도 "모른다" 면 전체를 모른다 — 일부만 보고 완료·착수 가능을 말하는 것이 추측이다.
  if (tickets.some((t) => t.backlogStatus == null)) return null;
  if (tickets.some((t) => t.status === "in_progress"))
    return { status: "in_progress", sourceStatus: "처리중", statusKnown: true };
  if (!hasOpenWork(tickets)) return { status: "done", sourceStatus: "완료", statusKnown: true };
  return { status: "pending", sourceStatus: "남음", statusKnown: true };
}

/**
 * 기능 목록의 `newTickets`(tickets/T<NN>.md, T04) 에 백로그 상태를 얹는다 — `applyInProgress` 와
 * 같은 원리(입력이 다른 파생물을 나중에 덮어씌운다, INV-1). `tickets`(issues 관례)는 건드리지
 * 않는다 — 그쪽 상태의 단일 출처는 여전히 문서다.
 *
 * 마지막에 **신관례 기능의 머리글 배지를 티켓 상태에서 다시 파생한다**(T01, D2) — 조인과 대기
 * 재계산이 끝난 뒤라야 배지가 본 네 수와 같은 입력을 보는 순서다(INV-3). 구관례 기능은 한 글자도
 * 바뀌지 않는다. 그 위에 **명시적 취소(`Status: wontfix`)가 계산을 이긴다**(T02, D3) — 취소는
 * 백로그 조인이 `pending` 을 채운 **뒤** 덮쓴다(`applyInProgress` 와 같은 형태).
 */
export function applyBacklogStatus(
  features: readonly Feature[],
  tasks: readonly BacklogTaskDoc[],
  repo: string,
  now: string = new Date().toISOString(),
): Feature[] {
  const joined = features.map((f) => ({
    ...f,
    newTickets: (f.newTickets ?? []).map((t) => joinTicket(t, tasks, repo, f.slug, now)),
  }));
  // 🔴 조인으로 상태가 바뀌었으니 신관례 티켓의 대기·착수 가능도 **다시** 계산한다(INV-3 —
  // 낡은 뷰 금지). buildFeatures 시점엔 백로그 상태를 모르므로(전부 pending) 신관례끼리의
  // 의존은 여기서 풀린다. 구관례(`tickets`)는 문서가 상태의 SoT 라 조인이 바꾸지 않으므로
  // 건드리지 않는다 — 그쪽 판정은 이미 buildFeature 가 끝낸다.
  const index: CrossFeatureIndex = new Map(
    joined.map((f) => [f.slug, featureNums([...f.tickets, ...(f.newTickets ?? [])])]),
  );
  return joined.map((f) => {
    // 🔴 취소 선언이 계산을 이긴다(T02, D3) — `spec.md` 의 `Status: wontfix` 는 최종이다.
    // 여기서 읽는 기능 수준 상태는 buildFeature 가 spec 줄에서 싣은 것(조인은 newTickets 만
    // 건드린다): `mapFirstmateStatus` 가 dropped 로 사상하는 원문 값은 wontfix 하나뿐이고
    // `statusKnown` 은 값을 알아봤다는 뜻이므로, 이 조건이 곧 "명시적 취소 선언" 이다. 새 파서도
    // 새 어휘도 없다 — 이미 있는 parseStatusLine + mapFirstmateStatus 의 결과를 읽을 뿐이다.
    const cancelled = f.status === "dropped" && f.statusKnown;
    const nums = index.get(f.slug);
    const rejudged = !nums
      ? f
      : {
          ...f,
          newTickets: (f.newTickets ?? []).map((t) => {
            const waiting = resolveWaitingOn(t.blockedBy, nums.done, index);
            return { ...t, waitingOn: waiting, startable: waiting.length === 0 };
          }),
        };
    const newTickets = rejudged.newTickets ?? [];
    if (newTickets.length === 0) return rejudged; // 구관례·티켓 없음 — 지금 그대로(D2)
    // 🔴 취소가 티켓까지 내려간다(T02, D4) — 아직 안 끝난 신관례 티켓은 dropped 로 취급하고,
    // 이미 done 인 티켓은 done 으로 남는다(착지한 일을 없던 일로 만들지 않는다). 조인 여부를
    // 가리지 않는다 — 기능 전체가 취소다. 백로그에 취소 상태를 만지 않는다(backlogStatus 는
    // 조인 사실 그대로), 문서에도 아무것도 쓰지 않는다 — 매 read 다시 판정한다(INV-1).
    if (cancelled)
      return {
        ...rejudged,
        status: "dropped",
        sourceStatus: "취소",
        statusKnown: true,
        newTickets: newTickets.map((t) =>
          t.status === "done" ? t : { ...t, status: "dropped", startable: false },
        ),
      };
    const badge = deriveHeaderBadge(newTickets);
    // 배지를 못 정하면(조인 실패, D5) 손으로 쓴 낡은 `Status:` 글자를 내주지 않는다 —
    // 썩은 배지(문제 1)의 반대편인 "없음" 이 답이다. 추측해서 채우지 않는다.
    return badge ? { ...rejudged, ...badge } : { ...rejudged, sourceStatus: null, statusKnown: false };
  });
}
