import type { Feature } from "@gootte/contract";

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
    const tickets = f.tickets.map((t) => ({
      ...t,
      unread: readMarks !== null && !readMarks.has(readMarkKey(f.slug, t.path)),
    }));
    return { ...f, tickets, hasUnreadTicket: tickets.some((t) => t.unread) };
  });
}
