import type { ProjectState } from "../state/model";
import { normalizeTrack } from "../parse/track";

/** 미분류(track 없음) 그룹 sentinel — 항상 마지막. */
export const UNGROUPED = "__ungrouped__";

const orderIdx = (state: ProjectState, slug: string): number => {
  const i = state.indexOrder.indexOf(slug);
  return i < 0 ? Number.POSITIVE_INFINITY : i;
};

/**
 * 대분류 그룹 전체 순서 — 결정적(INV-4). vocab(profile ## Tracks) 선언 순 +
 * vocab 밖 key(이니셔티브 indexOrder 최초등장 순) append. 미분류는 여기 미포함(present 필터가 붙임).
 * buildGantt·buildPlan 공유(순서 로직 단일 소유 — DRY).
 */
export function computeTrackOrder(state: ProjectState): string[] {
  const order: string[] = [...state.tracks.keys()];
  const seen = new Set(order);
  const byIndex = [...state.initiatives].sort(
    (a, b) => orderIdx(state, a.slug) - orderIdx(state, b.slug),
  );
  for (const i of byIndex) {
    const t = normalizeTrack(i.track, state.tracks);
    if (t && !seen.has(t.key)) {
      seen.add(t.key);
      order.push(t.key);
    }
  }
  return order;
}

/**
 * 실제 등장한 key 로 필터한 그룹 순서 + 미분류 last. gantt/plan 이 자기 rows/items 의 present 로 호출.
 */
export function presentTrackOrder(
  state: ProjectState,
  presentKeys: Iterable<string>,
  anyUngrouped: boolean,
): string[] {
  const present = new Set(presentKeys);
  const order = computeTrackOrder(state).filter((k) => present.has(k));
  if (anyUngrouped) order.push(UNGROUPED);
  return order;
}
