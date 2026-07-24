import type { GanttRow } from "@gootte/contract";
import { axisTicks, barSpanT, dateToT, type AxisTick } from "../../lib/timeline";

interface TimelineChartProps {
  rows: GanttRow[];
  from: string;
  to: string;
}

/**
 * CI 워터폴 룩 날짜축 Gantt (커스텀 CSS, ADR-0001 · 라이브러리 X).
 * 행=이니셔티브 · 바=sprint 기간 · 마커=kickoff(●)/re-kickoff(▲) · x축=날짜 눈금.
 * 위치는 % (반응형) — 순수 스케일(dateToT)이 배치만 계산(INV-4).
 */
export function TimelineChart({ rows, from, to }: TimelineChartProps) {
  const ticks = axisTicks(from, to);
  return (
    <div className="flex h-full flex-col overflow-auto">
      <AxisHeader ticks={ticks} />
      <div className="flex flex-col">
        {rows.map((row) => (
          <TimelineRow key={row.initiative} row={row} from={from} to={to} ticks={ticks} />
        ))}
      </div>
    </div>
  );
}

/** 상단 sticky 날짜축 — 왼쪽 라벨 거터 + 눈금(MM-DD). */
function AxisHeader({ ticks }: { ticks: AxisTick[] }) {
  return (
    <div className="sticky top-0 z-20 flex bg-bg pb-2">
      <div className="w-44 shrink-0" aria-hidden />
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

function TimelineRow({
  row,
  from,
  to,
  ticks,
}: {
  row: GanttRow;
  from: string;
  to: string;
  ticks: AxisTick[];
}) {
  return (
    <div className="flex items-center border-b border-border/40 py-2.5 odd:bg-surface/40">
      <div
        className="w-44 shrink-0 truncate pr-3 text-sm font-medium tracking-tight"
        title={row.initiative}
      >
        {row.initiative}
      </div>
      <div className="relative h-7 flex-1">
        {/* 날짜 gridline */}
        {ticks.map((tk) => (
          <span
            key={tk.date}
            aria-hidden
            className="absolute top-0 h-full w-px bg-border/50"
            style={{ left: `${tk.t * 100}%` }}
          />
        ))}
        {/* sprint 바 */}
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
        {/* kickoff / re-kickoff 마커 (바 위에) */}
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
