import type { DragEvent } from "react";

/**
 * 드래그 payload — HTML5 DnD `dataTransfer` 로 나른다(티켓 04). 티켓 칩과 기능 카드는
 * **서로 다른 MIME** 을 쓴다 — dragover 단계에선 `getData` 값을 못 읽고 `types` 목록만 보이므로
 * (브라우저 제약), MIME 이 갈라져 있어야 "이 드롭존이 받는 종류인가" 를 그 자리에서 판정할 수 있다.
 * 단계 줄은 티켓만, 트랙 칸은 기능만 받는다 — 서로 넘나들지 않는다.
 */

const TICKET_MIME = "application/x-gootte-plan-ticket";
const FEATURE_MIME = "application/x-gootte-plan-feature";

export interface TicketDragPayload {
  feature: string;
  ticket: string;
}

export interface FeatureDragPayload {
  feature: string;
}

export function setTicketDragData(e: DragEvent<Element>, feature: string, ticket: string): void {
  const payload: TicketDragPayload = { feature, ticket };
  e.dataTransfer.setData(TICKET_MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = "move";
}

export function setFeatureDragData(e: DragEvent<Element>, feature: string): void {
  const payload: FeatureDragPayload = { feature };
  e.dataTransfer.setData(FEATURE_MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = "move";
}

export function isTicketDrag(e: DragEvent<Element>): boolean {
  return e.dataTransfer.types.includes(TICKET_MIME);
}

export function isFeatureDrag(e: DragEvent<Element>): boolean {
  return e.dataTransfer.types.includes(FEATURE_MIME);
}

export function readTicketDragData(e: DragEvent<Element>): TicketDragPayload | null {
  const raw = e.dataTransfer.getData(TICKET_MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TicketDragPayload;
  } catch {
    return null;
  }
}

export function readFeatureDragData(e: DragEvent<Element>): FeatureDragPayload | null {
  const raw = e.dataTransfer.getData(FEATURE_MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FeatureDragPayload;
  } catch {
    return null;
  }
}
