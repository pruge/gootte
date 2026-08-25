import type { Feature, FeatureTicket, TodoStatus } from "@gootte/contract";
import { featureNums, resolveWaitingOn, type CrossFeatureIndex } from "./features";
import type { BacklogTaskDoc } from "../parse/backlog";

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
}

/**
 * 부모 작업 id 찾기 — `(repo: <repo>)` 가 같고, 메모 안에 `docs/features/<slug>/` 문구가 있는
 * 작업(task-planning.md §Parent/child identity: 부모의 백로그 메모가 `<project>:<feature-slug>`
 * 쌍을 담는다). 후보가 없으면 null — 추측하지 않는다.
 */
function findParentId(tasks: readonly BacklogTaskDoc[], repo: string, featureSlug: string): string | null {
  const needle = `docs/features/${featureSlug}/`;
  return tasks.find((t) => t.repo === repo && t.note.includes(needle))?.id ?? null;
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
): BacklogJoin | null {
  if (!ticketNum) return null;
  const parentId = findParentId(tasks, repo, featureSlug);
  if (!parentId) return null;
  const childId = `${parentId}-t${ticketNum.padStart(2, "0")}`;
  const task = tasks.find((t) => t.id === childId);
  if (!task) return null;
  const status = SECTION_STATUS[task.section];
  return { status, url: task.url, completedAt: status === "done" ? task.since : null };
}

function joinTicket(ticket: FeatureTicket, tasks: readonly BacklogTaskDoc[], repo: string, featureSlug: string): FeatureTicket {
  const join = joinTicketBacklog(tasks, repo, featureSlug, ticket.num);
  if (!join) return ticket;
  return {
    ...ticket,
    status: join.status,
    backlogStatus: join.status,
    backlogUrl: join.url,
    ...(join.completedAt ? { completedAt: join.completedAt } : {}),
  };
}

/**
 * 기능 목록의 `newTickets`(tickets/T<NN>.md, T04) 에 백로그 상태를 얹는다 — `applyInProgress` 와
 * 같은 원리(입력이 다른 파생물을 나중에 덮어씌운다, INV-1). `tickets`(issues 관례)는 건드리지
 * 않는다 — 그쪽 상태의 단일 출처는 여전히 문서다.
 */
export function applyBacklogStatus(features: readonly Feature[], tasks: readonly BacklogTaskDoc[], repo: string): Feature[] {
  const joined = features.map((f) => ({
    ...f,
    newTickets: (f.newTickets ?? []).map((t) => joinTicket(t, tasks, repo, f.slug)),
  }));
  // 🔴 조인으로 상태가 바뀌었으니 신관례 티켓의 대기·착수 가능도 **다시** 계산한다(INV-3 —
  // 낡은 뷰 금지). buildFeatures 시점엔 백로그 상태를 모르므로(전부 pending) 신관례끼리의
  // 의존은 여기서 풀린다. 구관례(`tickets`)는 문서가 상태의 SoT 라 조인이 바꾸지 않으므로
  // 건드리지 않는다 — 그쪽 판정은 이미 buildFeature 가 끝낸다.
  const index: CrossFeatureIndex = new Map(
    joined.map((f) => [f.slug, featureNums([...f.tickets, ...(f.newTickets ?? [])])]),
  );
  return joined.map((f) => {
    const nums = index.get(f.slug);
    if (!nums) return f;
    return {
      ...f,
      newTickets: (f.newTickets ?? []).map((t) => {
        const waiting = resolveWaitingOn(t.blockedBy, nums.done, index);
        return { ...t, waitingOn: waiting, startable: waiting.length === 0 };
      }),
    };
  });
}
