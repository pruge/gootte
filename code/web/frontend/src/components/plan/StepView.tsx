import { useState } from "react";
import type { Feature, PlanOrder } from "@gootte/contract";
import { Empty } from "../common/states";
import { groupByStep, UNASSIGNED_TRACK, type StepChip, type StepRow } from "./planGrouping";
import { TicketChip } from "./TicketChip";
import { StepGap } from "./StepGap";
import { isTicketDrag, readTicketDragData } from "./dragPayload";
import type { OpenDocFn } from "../features/FeatureTree";

interface StepViewProps {
  features: readonly Feature[];
  order: PlanOrder;
  highlighted: ReadonlySet<string>;
  onMoveToStep: (feature: string, ticket: string, step: number) => void;
  onInsertAfterStep: (feature: string, ticket: string, afterStep: number) => void;
  /** 🟡 칩을 다른 트랙 묶음으로 끌면 그 티켓이 속한 **기능 전체**의 트랙이 바뀐다 — 티켓 하나만 옮길 수 없다. */
  onMoveFeatureTrack: (feature: string, track: string) => void;
  /** 칩을 누르면 그 티켓 문서를 연다(development-order/15 ⑤). */
  onOpenDoc: OpenDocFn;
}

interface DraggingTicket {
  feature: string;
  track: string;
}

/** 카드(단계) 안의 트랙 묶음 하나 — 라벨은 칩과 같은 줄을 공유하지 않는다(라벨 위, 칩 아래). */
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
  onOpenDoc,
  onEnterBox,
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
  onOpenDoc: OpenDocFn;
  /** 이 상자 위에 있는 동안은 카드 배경("제자리 트랙 유지") 강조를 꺼 둔다 — 겹쳐 보이지 않게. */
  onEnterBox: () => void;
}) {
  const [over, setOver] = useState(false);
  const crossTrack = over && dragging !== null && dragging.track !== track;

  return (
    <div
      onDragOver={(e) => {
        if (!isTicketDrag(e)) return;
        e.preventDefault();
        e.stopPropagation(); // 카드 배경(StepCard)의 "제자리 트랙 유지" 처리로 안 새게 한다.
        e.dataTransfer.dropEffect = "move";
        setOver(true);
        onEnterBox();
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!isTicketDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const data = readTicketDragData(e);
        if (!data) return;
        if (dragging && dragging.track !== track) onMoveFeatureTrack(data.feature, track);
        onMoveToStep(data.feature, data.ticket, step);
      }}
      className={`min-w-0 rounded-md border-2 p-2 transition-colors ${
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
            onOpen={onOpenDoc}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * 카드 하나 = 단계 하나. 안에서 트랙 묶음이 위에서 아래로 쌓인다. 카드 바로 아래에 그 자신의 틈이 붙는다.
 *
 * 🔴 카드 배경(트랙 묶음 상자 밖)도 드롭존이다 — **끄는 티켓 자기 트랙 그대로** 이 단계로 옮긴다
 * (캡틴 피드백: "지금은 새 단계를 추가하는 것만 가능해. 단계 내에서 기존 트랙으로 추가가 가능하게
 * 해줘"). 이 단계에 그 트랙 묶음 상자가 아직 없을 때(그 트랙 티켓이 이 단계엔 하나도 없을 때)
 * 쓰는 자리다 — 상자가 있으면 그 상자에 놓으면 된다(`TrackGroup`, `stopPropagation` 으로 안 겹친다).
 * 🔴 트랙은 여기서 안 바뀐다 — `onMoveFeatureTrack` 을 부르지 않는다. 트랙을 바꾸는 유일한 길은
 * 다른 트랙 묶음 상자에 직접 놓는 것뿐이다(캡틴 피드백: "track이 다르면 막아야 하지 않나 —
 * track은 고정 아닌가").
 */
function StepCard({
  row,
  highlighted,
  dragging,
  onMoveToStep,
  onMoveFeatureTrack,
  onTicketDragStart,
  onTicketDragEnd,
  onInsertAfterStep,
  onOpenDoc,
}: {
  row: StepRow;
  highlighted: ReadonlySet<string>;
  dragging: DraggingTicket | null;
  onMoveToStep: (feature: string, ticket: string, step: number) => void;
  onMoveFeatureTrack: (feature: string, track: string) => void;
  onTicketDragStart: (feature: string, ticket: string) => void;
  onTicketDragEnd: () => void;
  onInsertAfterStep: (feature: string, ticket: string, afterStep: number) => void;
  onOpenDoc: OpenDocFn;
}) {
  const [cardOver, setCardOver] = useState(false);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <section
        onDragOver={(e) => {
          if (!isTicketDrag(e) || !dragging) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setCardOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setCardOver(false);
        }}
        onDrop={(e) => {
          if (!isTicketDrag(e) || !dragging) return;
          e.preventDefault();
          setCardOver(false);
          const data = readTicketDragData(e);
          if (!data) return;
          onMoveToStep(data.feature, data.ticket, row.step); // 트랙은 그대로 — onMoveFeatureTrack 안 부른다
        }}
        className={`min-w-0 rounded-lg border p-3 transition-colors ${
          cardOver ? "border-accent bg-accent/5" : "border-border bg-surface"
        }`}
      >
        <h3 className="mono mb-2 text-sm font-medium text-muted">단계 {row.step}</h3>
        {cardOver && dragging && (
          <p className="mono mb-2 text-xs text-accent">「{dragging.track}」 트랙 그대로 여기(단계 {row.step})로</p>
        )}
        <div className="flex min-w-0 flex-col gap-3">
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
              onOpenDoc={onOpenDoc}
              onEnterBox={() => setCardOver(false)}
            />
          ))}
        </div>
      </section>
      <StepGap afterStep={row.step} onInsertAfterStep={onInsertAfterStep} />
    </div>
  );
}

/**
 * 단계 보기(기본) — 기능 보기와 **같은 3열 그리드**를 쓰되, 칸은 **단계**다(캡틴 지시 2026-08-11:
 * "3column 그대로 두고 단계와 track 위치만 바꾸면 되는것을"). 칸(카드) 안에서 티켓은
 * **트랙별로** 묶인다 — 라벨은 칩과 같은 줄을 공유하지 않아(라벨 위, 칩 아래) 트랙 이름 자리를
 * 칩이 침범하지 못한다.
 * 🔴 넓으면 세 칸까지, 좁아지면 두 칸·한 칸으로 접힌다(기능 보기와 같은 반응형).
 * 카드를 다른 트랙 묶음으로 끌면 기능 전체의 트랙이, 다른 카드로 끌면 단계가 바뀐다.
 */
export function StepView({
  features,
  order,
  highlighted,
  onMoveToStep,
  onInsertAfterStep,
  onMoveFeatureTrack,
  onOpenDoc,
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
    <div className="flex min-w-0 flex-col gap-3">
      <StepGap afterStep={0} onInsertAfterStep={onInsertAfterStep} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <StepCard
            key={row.step}
            row={row}
            highlighted={highlighted}
            dragging={dragging}
            onMoveToStep={onMoveToStep}
            onMoveFeatureTrack={onMoveFeatureTrack}
            onTicketDragStart={onTicketDragStart}
            onTicketDragEnd={onTicketDragEnd}
            onInsertAfterStep={onInsertAfterStep}
            onOpenDoc={onOpenDoc}
          />
        ))}
      </div>
    </div>
  );
}
