import { Fragment, useState } from "react";
import type { Feature, PlanOrder } from "@gootte/contract";
import { Empty } from "../common/states";
import { groupByTrackStep, UNASSIGNED_TRACK, type StepChip } from "./planGrouping";
import { TicketChip } from "./TicketChip";
import { isTicketDrag, readTicketDragData } from "./dragPayload";

interface StepViewProps {
  features: readonly Feature[];
  order: PlanOrder;
  highlighted: ReadonlySet<string>;
  onMoveToStep: (feature: string, ticket: string, step: number) => void;
  onInsertAfterStep: (feature: string, ticket: string, afterStep: number) => void;
  /** 🟡 칩을 다른 칸으로 끌면 그 티켓이 속한 **기능 전체**의 트랙이 바뀐다(spec 09 ③) — 티켓 하나만 옮길 수 없다. */
  onMoveFeatureTrack: (feature: string, track: string) => void;
}

interface DraggingTicket {
  feature: string;
  track: string;
}

/**
 * 단계 줄과 줄 **사이**의 틈 — 여기 놓으면 새 단계가 생긴다(spec 04 §무엇이 바뀌나).
 * 트랙마다 같은 자리에 반복해 놓인다(단계는 전역이라 어느 칸에서 놓든 같은 뜻이다).
 */
function StepGapRow({
  afterStep,
  onInsertAfterStep,
}: {
  afterStep: number;
  onInsertAfterStep: (feature: string, ticket: string, afterStep: number) => void;
}) {
  const [active, setActive] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        if (!isTicketDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDrop={(e) => {
        if (!isTicketDrag(e)) return;
        e.preventDefault();
        setActive(false);
        const data = readTicketDragData(e);
        if (data) onInsertAfterStep(data.feature, data.ticket, afterStep);
      }}
      className={`mono flex items-center justify-center rounded transition-all ${
        active
          ? "h-7 border-2 border-dashed border-accent bg-accent/15 text-xs text-accent"
          : "h-2 border-2 border-dashed border-transparent"
      }`}
    >
      {active && "여기 새 단계"}
    </div>
  );
}

/** 칸(트랙) 안의 단계 하나 — 비어 있어도 자리를 지킨다(빈 자리도 정보다, spec 09 ③). */
function StepCell({
  track,
  step,
  chips,
  highlighted,
  dragging,
  onMoveToStep,
  onMoveFeatureTrack,
  onTicketDragStart,
  onTicketDragEnd,
}: {
  track: string;
  step: number;
  chips: readonly StepChip[];
  highlighted: ReadonlySet<string>;
  dragging: DraggingTicket | null;
  onMoveToStep: (feature: string, ticket: string, step: number) => void;
  onMoveFeatureTrack: (feature: string, track: string) => void;
  onTicketDragStart: (feature: string, ticket: string) => void;
  onTicketDragEnd: () => void;
}) {
  const [over, setOver] = useState(false);
  const crossTrack = over && dragging !== null && dragging.track !== track;

  return (
    <div
      onDragOver={(e) => {
        if (!isTicketDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!isTicketDrag(e)) return;
        e.preventDefault();
        setOver(false);
        const data = readTicketDragData(e);
        if (!data) return;
        if (dragging && dragging.track !== track) onMoveFeatureTrack(data.feature, track);
        onMoveToStep(data.feature, data.ticket, step);
      }}
      className={`min-w-0 rounded-md border-2 p-1.5 transition-colors ${
        crossTrack
          ? "border-partial bg-partial/10"
          : over
            ? "border-accent bg-accent/10"
            : "border-transparent"
      }`}
    >
      <h4 className="mono mb-1 text-xs text-muted">단계 {step}</h4>
      {crossTrack && (
        <p className="mono mb-1 text-xs text-partial">기능 전체가 「{track}」로 이동합니다</p>
      )}
      {chips.length === 0 ? (
        <span className="mono text-xs text-muted/60">—</span>
      ) : (
        <div className="flex min-w-0 flex-wrap gap-1.5">
          {chips.map((c) => (
            <TicketChip
              key={`${c.feature}/${c.ticketNum}`}
              feature={c.feature}
              ticketNum={c.ticketNum}
              ticket={c.ticket}
              highlighted={highlighted.has(`${c.feature}/${c.ticketNum}`)}
              whyNeedsReview={c.whyNeedsReview}
              onDragStart={onTicketDragStart}
              onDragEnd={onTicketDragEnd}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 단계 보기(기본, 티켓 09 ③) — 기능 보기와 **같은 얼개**: 트랙마다 세로 칸(넓으면 세 칸까지).
 * 칸 안에는 단계별로 티켓 칩이 놓인다. 🔴 같은 단계는 모든 칸에서 같은 높이에 선다 —
 * CSS subgrid 로 칸(트랙)을 바깥 그리드의 행에 맞춰, 어느 트랙에 그 단계가 비어도 자리를 지킨다.
 * 🔴 트랙을 한 줄로 펴지 않는다(티켓 03 금지 조항) — `groupByTrackStep` 이 기능 보기와 같은
 * 트랙 발견 방식을 쓴다(칸 나누기를 두 벌 짓지 않는다).
 */
export function StepView({
  features,
  order,
  highlighted,
  onMoveToStep,
  onInsertAfterStep,
  onMoveFeatureTrack,
}: StepViewProps) {
  const { steps, columns } = groupByTrackStep(features, order);
  const [dragging, setDragging] = useState<DraggingTicket | null>(null);
  if (steps.length === 0 || columns.length === 0) return <Empty>계획된 단계가 없습니다.</Empty>;

  const trackByFeature = new Map(order.features.map((f) => [f.feature, f.track]));
  // header(1) + 트랙마다: 틈(steps.length+1) + 단계(steps.length).
  const rowCount = 1 + (steps.length + 1) + steps.length;

  const onTicketDragStart = (feature: string, _ticket: string) => {
    setDragging({ feature, track: trackByFeature.get(feature) ?? UNASSIGNED_TRACK });
  };
  const onTicketDragEnd = () => setDragging(null);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {columns.map((col) => (
        <div
          key={col.track}
          className="grid min-w-0 gap-1.5 rounded-lg border border-border bg-surface p-3"
          style={{ gridTemplateRows: "subgrid", gridRow: `span ${rowCount}` }}
        >
          <h3 className="mono text-sm font-medium text-muted">{col.track}</h3>
          <StepGapRow afterStep={0} onInsertAfterStep={onInsertAfterStep} />
          {col.rows.map((row) => (
            <Fragment key={row.step}>
              <StepCell
                track={col.track}
                step={row.step}
                chips={row.chips}
                highlighted={highlighted}
                dragging={dragging}
                onMoveToStep={onMoveToStep}
                onMoveFeatureTrack={onMoveFeatureTrack}
                onTicketDragStart={onTicketDragStart}
                onTicketDragEnd={onTicketDragEnd}
              />
              <StepGapRow afterStep={row.step} onInsertAfterStep={onInsertAfterStep} />
            </Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}
