import type { DragWarning, FeatureTicket, TicketOrderEntry } from "@gootte/contract";

/**
 * 드래그가 놓이는 순간의 네 검사 — 순수 함수, 결정적, 즉시 답한다(spec 04 §놓는 순간, INV-4).
 * planner 를 부르지 않는다. 검사는 드래그를 막지 않는다 — 호출자가 경고로만 보여준다.
 *
 * 🔴 막힘·임자 판정을 새로 만들지 않는다 — `FeatureTicket`(waitingOn·startable·status·sourceStatus)을
 * 그대로 읽는다(INV-1). 여기서 하는 것은 "이 드래그가 그 판정과 어긋나는가" 하나뿐이다.
 */
export function checkTicketDragWarnings(
  ticket: FeatureTicket,
  feature: string,
  newStep: number,
  ticketOrdersAfterMove: readonly TicketOrderEntry[],
): DragWarning[] {
  const warnings: DragWarning[] = [];

  if (ticket.status === "done" || ticket.status === "dropped") {
    warnings.push({
      kind: "already_done",
      detail: `${feature}/${ticket.num} — 이미 끝난 티켓의 자리를 옮겼다`,
    });
  }

  if (ticket.status === "in_progress" || ticket.sourceStatus === "claimed") {
    warnings.push({
      kind: "claimed",
      detail: `${feature}/${ticket.num} — 지금 누가 붙들고 있는 티켓의 자리를 옮겼다`,
    });
  }

  // blockedBy = "적힌 것"(기록된 선행), waitingOn = 그중 아직 안 풀린 것. 전자가 있는데
  // 후자가 비었으면 적힌 선행이 전부 착지했다는 뜻 — `why` 가 그 사실을 아직 안 담았을 수 있다.
  if (ticket.blockedBy.length > 0 && ticket.waitingOn.length === 0) {
    warnings.push({
      kind: "stale_block_reason",
      detail: `${feature}/${ticket.num} — 기다린다고 적힌 선행이 이미 착지했다`,
    });
  }

  for (const blocker of ticket.waitingOn) {
    const entry = ticketOrdersAfterMove.find((o) => o.feature === feature && o.ticket === blocker);
    if (entry && entry.step >= newStep) {
      warnings.push({
        kind: "blocked_regression",
        detail: `${feature}/${ticket.num} — 기다리는 ${feature}/${blocker} 이 같거나 뒤 단계(${entry.step})에 있다`,
      });
    }
  }

  return warnings;
}
