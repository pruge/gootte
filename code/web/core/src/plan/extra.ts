import type { ExtraEntry, ExtraListItem, Feature } from "@gootte/contract";

function ticketExists(features: readonly Feature[], featureSlug: string, ticketNum: string): boolean {
  const feature = features.find((f) => f.slug === featureSlug);
  if (!feature) return false;
  return feature.tickets.some((t) => t.num === ticketNum);
}

/**
 * `extra` 항목에 "가리키는 티켓이 지금 있는가" 를 얹는다 — 저장하지 않고 매 읽기 계산한다(INV-1).
 * 없는 티켓을 가리켜도 거절하지 않는다 — 그 사실 자체가 표시할 신호다(development-order/05).
 */
export function annotateExtraExistence(
  entries: readonly ExtraEntry[],
  features: readonly Feature[],
): ExtraListItem[] {
  return entries.map((e) => ({ ...e, ticketExists: ticketExists(features, e.feature, e.ticket) }));
}
