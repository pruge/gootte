import type { Track } from "@gootte/contract";

/** 서버 trackOrder 의 미분류 그룹 sentinel(= core UNGROUPED). */
export const UNGROUPED = "__ungrouped__";

export interface TrackGrouped<T> {
  key: string;
  label: string;
  items: T[];
}

/**
 * 임의 항목을 대분류(track.key)로 그룹핑, **서버 trackOrder 순** 정렬(미분류 last).
 * 순서 재판정 X — 서버값 그대로(INV-4). 순수·결정적. 타임라인·리스트 공용.
 */
export function groupByTrack<T>(
  items: T[],
  trackOf: (item: T) => Track | null,
  trackOrder: string[],
): TrackGrouped<T>[] {
  const byKey = new Map<string, TrackGrouped<T>>();
  for (const item of items) {
    const t = trackOf(item);
    const key = t?.key ?? UNGROUPED;
    let g = byKey.get(key);
    if (!g) {
      g = { key, label: t?.label ?? "미분류", items: [] };
      byKey.set(key, g);
    }
    g.items.push(item);
  }
  const ordered = trackOrder
    .map((k) => byKey.get(k))
    .filter((g): g is TrackGrouped<T> => g !== undefined);
  const seen = new Set(trackOrder);
  for (const [k, g] of byKey) if (!seen.has(k)) ordered.push(g);
  return ordered;
}
