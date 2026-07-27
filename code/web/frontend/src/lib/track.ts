import type { RoadmapItem, Track, WorktreeStatus } from "@gootte/contract";

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

/**
 * 활성 worktree 를 소속 대분류(track)로 묶음 — worktree.initiative → RoadmapItem.track.key.
 * initiative 미바인딩(null)·roadmap 에 없는 것은 UNGROUPED. 순수·결정적("작업중" 카운트/필터 공용).
 */
export function worktreesByTrack(
  worktrees: WorktreeStatus[],
  items: RoadmapItem[],
): Map<string, WorktreeStatus[]> {
  const trackKeyOf = new Map(items.map((i) => [i.initiative, i.track?.key ?? UNGROUPED]));
  const out = new Map<string, WorktreeStatus[]>();
  for (const w of worktrees) {
    const key = (w.initiative ? trackKeyOf.get(w.initiative) : undefined) ?? UNGROUPED;
    const arr = out.get(key);
    if (arr) arr.push(w);
    else out.set(key, [w]);
  }
  return out;
}
