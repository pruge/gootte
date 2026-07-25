import { useEffect, useState } from "react";
import type { GanttRow } from "@gootte/contract";
import {
  axisTicks,
  barSpanT,
  dateToT,
  groupByTrack,
  UNGROUPED,
  type AxisTick,
  type TrackGroup,
} from "../../lib/timeline";

interface TimelineChartProps {
  project: string;
  rows: GanttRow[];
  from: string;
  to: string;
  trackOrder: string[];
}

interface Hover {
  group: string;
  initiative: string;
}

const GROUP_W_DEFAULT = 112;
const INIT_W_DEFAULT = 176;
const COL_MIN = 64;

interface ColWidths {
  groupW: number;
  initW: number;
}

/** 프로젝트별 localStorage 키 — 폭을 프로젝트마다 개별 저장/복원. */
const storageKey = (project: string) => `gootte:timeline:cols:${project}`;

function loadWidths(project: string): ColWidths {
  try {
    const raw = localStorage.getItem(storageKey(project));
    if (raw) {
      const p = JSON.parse(raw) as Partial<ColWidths>;
      const g = Number(p.groupW);
      const i = Number(p.initW);
      if (Number.isFinite(g) && Number.isFinite(i)) {
        return { groupW: Math.max(COL_MIN, g), initW: Math.max(COL_MIN, i) };
      }
    }
  } catch {
    /* localStorage 접근 불가/파싱 실패 = 기본값 */
  }
  return { groupW: GROUP_W_DEFAULT, initW: INIT_W_DEFAULT };
}

/**
 * 드래그로 컬럼 폭 조절 + **프로젝트별 localStorage 영속**(refresh 후 복원).
 * 컴포넌트는 project 로 키(remount)돼 마운트 시 그 프로젝트 값을 로드.
 */
function usePersistentCols(project: string) {
  const [widths, setWidths] = useState<ColWidths>(() => loadWidths(project));

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(project), JSON.stringify(widths));
    } catch {
      /* 저장 실패 무시 */
    }
  }, [project, widths]);

  const makeResize = (which: keyof ColWidths) => (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = widths[which];
    const move = (ev: MouseEvent) =>
      setWidths((prev) => ({ ...prev, [which]: Math.max(COL_MIN, startW + ev.clientX - startX) }));
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  return {
    groupW: widths.groupW,
    initW: widths.initW,
    onGroupResize: makeResize("groupW"),
    onInitResize: makeResize("initW"),
  };
}

/**
 * 컬럼 우측 경계 드래그 핸들 — 셀 높이 전체(h-full)를 덮는 grab 영역(w-2.5).
 * hover 시 세로선이 accent 로 굵어져 조절 가능함을 표시. header·그룹셀·행셀 우측에 배치해 컬럼 전 높이에서 잡힘.
 */
function ColResizer({ onMouseDown, label }: { onMouseDown: (e: React.MouseEvent) => void; label: string }) {
  return (
    <span
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      className="group/resize absolute right-0 top-0 z-30 flex h-full w-2.5 translate-x-1/2 cursor-col-resize items-stretch justify-center"
    >
      <span className="w-px bg-transparent transition-all group-hover/resize:w-0.5 group-hover/resize:bg-accent" />
    </span>
  );
}

/**
 * CI 워터폴 룩 날짜축 Gantt — 대분류(track) 그룹핑(ADR-0003).
 * 좌측 대분류 라벨 세로 span + `│` + 그 track 의 sprint 라인들 · hover 시 행+그룹 라벨 co-highlight.
 * 대분류·이니셔티브 컬럼 = 드래그로 폭 조절(말줄임 완화). 위치는 % (반응형), 그룹 순서는 서버 trackOrder(INV-4).
 */
export function TimelineChart({ project, rows, from, to, trackOrder }: TimelineChartProps) {
  const ticks = axisTicks(from, to);
  const groups = groupByTrack(rows, trackOrder);
  const [hover, setHover] = useState<Hover | null>(null);
  const { groupW, initW, onGroupResize, onInitResize } = usePersistentCols(project);

  return (
    <div className="flex h-full flex-col overflow-auto">
      <AxisHeader
        ticks={ticks}
        groupW={groupW}
        initW={initW}
        onGroupResize={onGroupResize}
        onInitResize={onInitResize}
      />
      <div className="flex flex-col">
        {groups.map((group) => (
          <TrackGroupBlock
            key={group.key}
            group={group}
            from={from}
            to={to}
            ticks={ticks}
            groupW={groupW}
            initW={initW}
            onGroupResize={onGroupResize}
            onInitResize={onInitResize}
            hover={hover}
            onHover={setHover}
          />
        ))}
      </div>
    </div>
  );
}

/** 상단 sticky 날짜축 — 대분류 셀 + 이니셔티브 거터(리사이즈 핸들) + 눈금(MM-DD). */
function AxisHeader({
  ticks,
  groupW,
  initW,
  onGroupResize,
  onInitResize,
}: {
  ticks: AxisTick[];
  groupW: number;
  initW: number;
  onGroupResize: (e: React.MouseEvent) => void;
  onInitResize: (e: React.MouseEvent) => void;
}) {
  return (
    <div className="sticky top-0 z-20 flex bg-bg pb-2">
      <div className="relative h-5 shrink-0" style={{ width: groupW }}>
        <ColResizer onMouseDown={onGroupResize} label="대분류 열 너비 조절" />
      </div>
      <div className="relative h-5 shrink-0" style={{ width: initW }}>
        <ColResizer onMouseDown={onInitResize} label="이니셔티브 열 너비 조절" />
      </div>
      <div className="relative h-5 flex-1 border-b border-border">
        {ticks.map((tk) => (
          <span
            key={tk.date}
            className="mono absolute -translate-x-1/2 whitespace-nowrap text-sm text-muted"
            style={{ left: `${tk.t * 100}%` }}
          >
            {tk.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 대분류 그룹 — 좌측 라벨 셀(세로 span) `│` + 그 track 행들. */
function TrackGroupBlock({
  group,
  from,
  to,
  ticks,
  groupW,
  initW,
  onGroupResize,
  onInitResize,
  hover,
  onHover,
}: {
  group: TrackGroup;
  from: string;
  to: string;
  ticks: AxisTick[];
  groupW: number;
  initW: number;
  onGroupResize: (e: React.MouseEvent) => void;
  onInitResize: (e: React.MouseEvent) => void;
  hover: Hover | null;
  onHover: (h: Hover | null) => void;
}) {
  const active = hover?.group === group.key;
  return (
    <div className="flex border-b border-border">
      <div
        aria-label={group.label}
        data-track-group={group.key}
        data-active={active}
        style={{ width: groupW }}
        className={`relative flex shrink-0 flex-col justify-center gap-0.5 border-r border-border px-2.5 py-2 transition-colors ${
          active ? "bg-surface-2" : ""
        }`}
      >
        <span className="text-sm font-semibold leading-tight tracking-tight">{group.label}</span>
        {group.key !== UNGROUPED && <span className="mono text-sm text-muted">{group.key}</span>}
        <ColResizer onMouseDown={onGroupResize} label="대분류 열 너비 조절" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {group.rows.map((row) => (
          <TimelineRow
            key={row.initiative}
            row={row}
            from={from}
            to={to}
            ticks={ticks}
            initW={initW}
            onInitResize={onInitResize}
            highlighted={hover?.initiative === row.initiative}
            onEnter={() => onHover({ group: group.key, initiative: row.initiative })}
            onLeave={() => onHover(null)}
          />
        ))}
      </div>
    </div>
  );
}

function TimelineRow({
  row,
  from,
  to,
  ticks,
  initW,
  onInitResize,
  highlighted,
  onEnter,
  onLeave,
}: {
  row: GanttRow;
  from: string;
  to: string;
  ticks: AxisTick[];
  initW: number;
  onInitResize: (e: React.MouseEvent) => void;
  highlighted: boolean;
  onEnter: () => void;
  onLeave: () => void;
}) {
  return (
    <div
      data-track-row={row.initiative}
      data-active={highlighted}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className={`flex items-center border-b border-border/30 py-2.5 transition-colors last:border-b-0 ${
        highlighted ? "bg-surface-2" : "hover:bg-surface/60"
      }`}
    >
      <div
        className="relative shrink-0 border-r border-border/60 text-sm font-medium tracking-tight"
        style={{ width: initW }}
        title={row.initiative}
      >
        {/* 텍스트만 truncate — 셀은 overflow 허용해야 우측 리사이저가 안 잘림 */}
        <span className="block truncate px-2">{row.initiative}</span>
        <ColResizer onMouseDown={onInitResize} label="이니셔티브 열 너비 조절" />
      </div>
      <div className="relative h-7 flex-1">
        {ticks.map((tk) => (
          <span
            key={tk.date}
            aria-hidden
            className="absolute top-0 h-full w-px bg-border/50"
            style={{ left: `${tk.t * 100}%` }}
          />
        ))}
        {row.bars.map((b, i) => {
          const { x, w } = barSpanT(b.start, b.end, from, to);
          return (
            <div
              key={`bar-${i}`}
              title={`${b.label} · ${b.start} ~ ${b.end}`}
              className="absolute top-1/2 flex h-4 -translate-y-1/2 items-center overflow-hidden rounded bg-accent/75 pl-1.5 ring-1 ring-accent/40"
              style={{ left: `${x * 100}%`, width: `max(${w * 100}%, 8px)` }}
            >
              <span className="mono truncate text-sm leading-none text-accent-fg">{b.label}</span>
            </div>
          );
        })}
        {row.markers.map((m, i) => (
          <span
            key={`mk-${i}`}
            title={`${m.kind === "re-kickoff" ? "재-kickoff" : "kickoff"} · ${m.at}`}
            aria-label={`${m.kind} ${m.at}`}
            className={`absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-sm leading-none ${
              m.kind === "re-kickoff" ? "text-partial" : "text-accent"
            }`}
            style={{ left: `${dateToT(m.at, from, to) * 100}%` }}
          >
            {m.kind === "re-kickoff" ? "▲" : "●"}
          </span>
        ))}
      </div>
    </div>
  );
}
