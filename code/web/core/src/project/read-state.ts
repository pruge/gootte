import type { Feature } from "@gootte/contract";
import { allTickets } from "./features";

/**
 * 안 읽은 티켓 판정 — 순수(INV-4, unread-tickets-show-themselves/01).
 *
 * 🔴 표시가 붙는 것은 티켓뿐이다(캡틴 결정 ②) — 명세·결정 기록은 여기서 다루지 않는다.
 * 🔴 **읽음 기록을 못 읽었으면**(`readMarks === null`) **조용한 쪽으로 기운다**(INV-U1) — 전부
 * 읽은 것으로 본다. 거짓 초록은 캡틴을 헛걸음시키고, 몇 번 반복되면 초록 자체를 안 믿게 된다.
 */
export function readMarkKey(feature: string, path: string): string {
  return `${feature}/${path}`;
}

export function applyReadState(
  features: readonly Feature[],
  readMarks: ReadonlySet<string> | null,
): Feature[] {
  return features.map((f) => {
    // 두 관례를 같은 표식으로 심는다 — `tickets/` 만 쓰는 기능의 티켓도 안 읽음이 될 수 있어야
    // 한다(실제 결함, 2026-08 캡틴 보고). 병합 읽기는 `allTickets` 하나뿐이다.
    const mark = (t: Feature["tickets"][number]) => ({
      ...t,
      unread: readMarks !== null && !readMarks.has(readMarkKey(f.slug, t.path)),
    });
    const tickets = f.tickets.map(mark);
    const newTickets = f.newTickets?.map(mark);
    return {
      ...f,
      tickets,
      newTickets,
      hasUnreadTicket: allTickets({ ...f, tickets, newTickets }).some((t) => t.unread),
    };
  });
}
