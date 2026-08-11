import { useState } from "react";
import type { Feature, PlanOrder } from "@gootte/contract";
import { Empty } from "../common/states";
import { groupByStep, UNASSIGNED_TRACK, type StepChip } from "./planGrouping";
import { TicketChip } from "./TicketChip";
import { isTicketDrag, readTicketDragData } from "./dragPayload";

interface StepViewProps {
  features: readonly Feature[];
  order: PlanOrder;
  highlighted: ReadonlySet<string>;
  onMoveToStep: (feature: string, ticket: string, step: number) => void;
  onInsertAfterStep: (feature: string, ticket: string, afterStep: number) => void;
  /** 🟡 칩을 다른 트랙 묶음으로 끌면 그 티켓이 속한 **기능 전체**의 트랙이 바뀐다 — 티켓 하나만 옮길 수 없다. */
  onMoveFeatureTrack: (feature: string, track: string) => void;
}

interface DraggingTicket {
  feature: string;
  track: string;
}

/**
 * 단계 줄과 줄 **사이**의 틈 — 여기 놓으면 새 단계가 생긴다(spec 04 §무엇이 바뀌나).
 */
function StepGap({
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

/** 단계 카드 안의 트랙 묶음 하나 — 라벨은 칩과 같은 줄을 공유하지 않는다(라벨 위, 칩 아래). */
function TrackGroup({
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
      className={`min-w-44 max-w-full rounded-md border-2 p-2 transition-colors ${
        crossTrack
          ? "border-partial bg-partial/10"
          : over
            ? "border-accent bg-accent/10"
            : "border-transparent bg-surface-2/40"
      }`}
    >
      <h4 className="mono mb-1.5 text-xs font-medium text-muted">{track}</h4>
      {crossTrack && (
        <p className="mono mb-1 text-xs text-partial">기능 전체가 「{track}」로 이동합니다</p>
      )}
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
    </div>
  );
}

/**
 * 단계 보기(기본) — 카드는 **단계**, 그 안에서 **트랙별로** 티켓을 묶는다(캡틴 지시 2026-08-11).
 * 🔴 트랙을 한 줄로 펴지 않는다 — 같은 단계 안에서도 트랙마다 자기 묶음을 갖는다.
 * 티켓 칩을 다른 단계 카드로 끌면 그 단계로, 카드와 카드 사이(`StepGap`)에 놓으면 새 단계가 생긴다.
 * 다른 트랙 묶음으로 끌면 그 기능 전체의 트랙이 바뀐다 — 끄는 동안 그 사실이 먼저 보인다.
 */
export function StepView({
  features,
  order,
  highlighted,
  onMoveToStep,
  onInsertAfterStep,
  onMoveFeatureTrack,
}: StepViewProps) {
  const rows = groupByStep(features, order);
  const [dragging, setDragging] = useState<DraggingTicket | null>(null);
  if (rows.length === 0) return <Empty>계획된 단계가 없습니다.</Empty>;

  const trackByFeature = new Map(order.features.map((f) => [f.feature, f.track]));
  const onTicketDragStart = (feature: string, _ticket: string) => {
    setDragging({ feature, track: trackByFeature.get(feature) ?? UNASSIGNED_TRACK });
  };
  const onTicketDragEnd = () => setDragging(null);

  return (
    <div className="flex min-w-0 flex-col">
      <StepGap afterStep={0} onInsertAfterStep={onInsertAfterStep} />
      {rows.map((row) => (
        <div key={row.step} className="flex min-w-0 flex-col gap-1">
          <section className="min-w-0 rounded-lg border border-border bg-surface p-3">
            <h3 className="mono mb-2 text-sm font-medium text-muted">단계 {row.step}</h3>
            <div className="flex min-w-0 flex-wrap gap-3">
              {row.byTrack.map((g) => (
                <TrackGroup
                  key={g.track}
                  track={g.track}
                  step={row.step}
                  chips={g.chips}
                  highlighted={highlighted}
                  dragging={dragging}
                  onMoveToStep={onMoveToStep}
                  onMoveFeatureTrack={onMoveFeatureTrack}
                  onTicketDragStart={onTicketDragStart}
                  onTicketDragEnd={onTicketDragEnd}
                />
              ))}
            </div>
          </section>
          <StepGap afterStep={row.step} onInsertAfterStep={onInsertAfterStep} />
        </div>
      ))}
    </div>
  );
}
