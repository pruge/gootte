import type { GanttRow, GanttBar, GanttMarker } from "@gootte/contract";
import type { ProjectState } from "../state/model";

export interface GanttResult {
  rows: GanttRow[];
  from: string | null;
  to: string | null;
}

/**
 * 순수 projection — sprint 기간(날짜)을 이니셔티브별 Gantt 바로, kickoff 이벤트를 마커로.
 * B1: 바 = sprint 만(Worktree는 날짜 소스 없음). B2: 날짜 granularity(YYYY-MM-DD).
 */
export function buildGantt(state: ProjectState): GanttResult {
  const todoInit = new Map<string, string>(); // todo slug → initiative
  for (const i of state.initiatives) for (const t of i.todos) todoInit.set(t.slug, i.slug);

  const barsByInit = new Map<string, GanttBar[]>();
  for (const s of state.sprints) {
    if (!s.startedAt || !s.endedAt) continue; // 날짜 없으면 바 X
    const initSlug = s.todos.map((t) => todoInit.get(t)).find((x): x is string => Boolean(x));
    if (!initSlug) continue;
    const list = barsByInit.get(initSlug) ?? [];
    list.push({ kind: "sprint", label: s.slug, start: s.startedAt, end: s.endedAt });
    barsByInit.set(initSlug, list);
  }

  const markersByInit = new Map<string, GanttMarker[]>();
  for (const i of state.initiatives) {
    const ms = i.events
      .filter((e) => e.at)
      .map<GanttMarker>((e) => ({ at: e.at, kind: e.kind, label: i.slug }));
    if (ms.length) markersByInit.set(i.slug, ms);
  }

  const dates: string[] = [];
  const rows: GanttRow[] = [];
  for (const slug of new Set([...barsByInit.keys(), ...markersByInit.keys()])) {
    const bars = barsByInit.get(slug) ?? [];
    const markers = markersByInit.get(slug) ?? [];
    for (const b of bars) dates.push(b.start, b.end);
    for (const m of markers) dates.push(m.at);
    rows.push({ initiative: slug, track: null, bars, markers }); // track = 019 projection 이 정규화 부착
  }

  const earliest = (r: GanttRow): string =>
    [...r.bars.map((b) => b.start), ...r.markers.map((m) => m.at)].sort()[0] ?? "9999";
  rows.sort((a, b) => {
    const ea = earliest(a);
    const eb = earliest(b);
    if (ea !== eb) return ea < eb ? -1 : 1;
    return state.indexOrder.indexOf(a.initiative) - state.indexOrder.indexOf(b.initiative);
  });

  const sorted = dates.slice().sort();
  return { rows, from: sorted[0] ?? null, to: sorted[sorted.length - 1] ?? null };
}
