import type { GanttRow } from "@gootte/contract";

// 타임라인(Gantt) 순수 스케일 — 날짜(YYYY-MM-DD) → 정규화 위치(0..1)/픽셀.
// 레이아웃(배치)만 계산 — 데이터 재판정 X(INV-4). 부수효과 0, 단위 테스트 대상.

/** 서버 trackOrder 의 미분류 그룹 sentinel(= core UNGROUPED). */
export const UNGROUPED = "__ungrouped__";

export interface TrackGroup {
  key: string;
  label: string;
  rows: GanttRow[];
}

/**
 * rows 를 대분류(track.key)로 그룹핑, **서버 trackOrder 순** 정렬(미분류 last).
 * 순서 재판정 X — 서버값 그대로 소비(INV-4). 순수·결정적.
 */
export function groupByTrack(rows: GanttRow[], trackOrder: string[]): TrackGroup[] {
  const byKey = new Map<string, TrackGroup>();
  for (const row of rows) {
    const key = row.track?.key ?? UNGROUPED;
    let g = byKey.get(key);
    if (!g) {
      g = { key, label: row.track?.label ?? "미분류", rows: [] };
      byKey.set(key, g);
    }
    g.rows.push(row);
  }
  const ordered = trackOrder
    .map((k) => byKey.get(k))
    .filter((g): g is TrackGroup => g !== undefined);
  // 서버 trackOrder 에 없는 잔여(방어) — 끝에 append.
  const seen = new Set(trackOrder);
  for (const [k, g] of byKey) if (!seen.has(k)) ordered.push(g);
  return ordered;
}

const MS_PER_DAY = 86_400_000;

/** YYYY-MM-DD → epoch day 정수(UTC). 파싱 실패 = NaN. */
export function dayNumber(date: string): number {
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(ms) ? NaN : Math.floor(ms / MS_PER_DAY);
}

/** epoch day → YYYY-MM-DD. */
function fromDayNumber(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** YYYY-MM-DD → MM-DD 라벨(짧은 축 눈금). */
function mmdd(date: string): string {
  return date.length >= 10 ? date.slice(5) : date;
}

/**
 * 날짜 → [from,to] 구간의 정규화 위치 t ∈ [0,1].
 * from==to(단일 날짜)이거나 파싱 실패 = 0. 구간 밖은 clamp.
 */
export function dateToT(date: string, from: string, to: string): number {
  const d = dayNumber(date);
  const a = dayNumber(from);
  const b = dayNumber(to);
  if (!Number.isFinite(d) || !Number.isFinite(a) || !Number.isFinite(b)) return 0;
  if (b <= a) return 0;
  return Math.min(1, Math.max(0, (d - a) / (b - a)));
}

/** 날짜 → [0,width] 픽셀 x. dateToT 의 픽셀 래퍼. */
export function dateToX(date: string, from: string, to: string, width: number): number {
  return dateToT(date, from, to) * width;
}

/** 바(start~end) → 정규화 {x, w} (0..1). 폭은 최소 minW(가시성, 기본 0). */
export function barSpanT(
  start: string,
  end: string,
  from: string,
  to: string,
  minW = 0,
): { x: number; w: number } {
  const x = dateToT(start, from, to);
  const x2 = dateToT(end, from, to);
  return { x, w: Math.max(minW, x2 - x) };
}

export interface AxisTick {
  date: string;
  label: string; // MM-DD
  t: number; // 0..1
}

/**
 * 날짜축 눈금 — from~to 를 대략 target 등분(정수 일 간격), MM-DD 라벨.
 * 단일 날짜/역전 = 시작 눈금 1개. 끝(to)이 마지막 눈금과 다르면 to 추가(경계 표시).
 */
export function axisTicks(from: string, to: string, target = 7): AxisTick[] {
  const a = dayNumber(from);
  const b = dayNumber(to);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) {
    return [{ date: from, label: mmdd(from), t: 0 }];
  }
  const span = b - a;
  const step = Math.max(1, Math.round(span / Math.max(1, target - 1)));
  const ticks: AxisTick[] = [];
  for (let day = a; day <= b; day += step) {
    const date = fromDayNumber(day);
    ticks.push({ date, label: mmdd(date), t: (day - a) / span });
  }
  const last = ticks[ticks.length - 1];
  if (last && last.date !== to) ticks.push({ date: to, label: mmdd(to), t: 1 });
  return ticks;
}
