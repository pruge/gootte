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
  /**
   * 🔴 이 보기에서 티켓 칩을 끄는 어떤 방식도 트랙을 바꾸지 않는다 — 오직 단계만 바뀐다
   * (티켓 04 §무엇이 바뀌나: "티켓 칩 → 단계", "기능 카드 → 트랙" 으로 축이 이미 갈라져 있다.
   * 트랙을 바꾸는 유일한 길은 기능 보기에서 기능 카드 자체를 끄는 것이다, `FeatureView`).
   */
  onMoveToStep: (feature: string, ticket: string, step: number) => void;
  onInsertAfterStep: (feature: string, ticket: string, afterStep: number) => void;
  /** 칩을 누르면 그 티켓 문서를 연다(development-order/15 ⑤). */
  onOpenDoc: OpenDocFn;
}

interface DraggingTicket {
  feature: string;
  track: string;
}

/**
 * 카드(단계) 안의 트랙 묶음 하나 — 라벨은 칩과 같은 줄을 공유하지 않는다(라벨 위, 칩 아래).
 * 🔴 이 상자의 라벨과 끄는 티켓의 트랙이 달라도 트랙은 안 바뀐다 — 단계만 옮긴다(티켓 04 §표,
 * 캡틴 피드백 2026-08-11: "track이 다르면 막아야 하지 않나 — track은 고정 아닌가").
 *
 * 🔴 강조 여부는 **마우스가 이 상자 위에 있는지가 아니라, 이 상자가 끄는 티켓 자기 트랙과
 * 같은지**로만 정한다(부모 `StepCard` 가 계산해 넘긴다) — 캡틴 피드백: "화면은 밝게 빛나는데
 * 정작 못 가잖아." 카드 어디에 마우스가 있든 실제로 놓일 자리는 하나(그 티켓의 트랙 상자)뿐이라,
 * 그 자리만 정확히 빛나야 한다. 그래서 이 컴포넌트는 자기 드래그 이벤트를 더는 안 듣는다 —
 * 실제 드롭은 카드 전체(`StepCard`)가 받는다.
 */
function TrackGroup({
  track,
  chips,
  highlighted,
  isDropTarget,
  onTicketDragStart,
  onTicketDragEnd,
  onOpenDoc,
}: {
  track: string;
  chips: readonly StepChip[];
  highlighted: ReadonlySet<string>;
  isDropTarget: boolean;
  onTicketDragStart: (feature: string, ticket: string) => void;
  onTicketDragEnd: () => void;
  onOpenDoc: OpenDocFn;
}) {
  return (
    <div
      className={`min-w-0 rounded-md border-2 p-2 transition-colors ${
        isDropTarget ? "border-accent bg-accent/10" : "border-transparent bg-surface-2/40"
      }`}
    >
      <h4 className="mono mb-1.5 text-xs font-medium text-muted">{track}</h4>
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
 * 이 단계에 끄는 티켓의 트랙 상자가 아직 없을 때 — 그 자리에 생길 상자를 미리 보여준다
 * (캡틴 피드백: "없으면, 기존 카드 공간을 벌려서 가상의 공간을 표시해"). `TrackGroup` 과 같은
 * 크기·여백을 써서 실제로 자리가 벌어지는 것처럼 보이게 하고, 점선 테두리로 "아직 없다" 를 가른다.
 */
function GhostTrackGroup({ track }: { track: string }) {
  return (
    <div className="min-w-0 rounded-md border-2 border-dashed border-accent bg-accent/5 p-2">
      <h4 className="mono mb-1.5 text-xs font-medium text-accent">{track}</h4>
      <p className="mono text-xs text-accent/80">여기로 옮겨집니다 — 새 묶음이 생깁니다</p>
    </div>
  );
}

/**
 * 카드 하나 = 단계 하나. 안에서 트랙 묶음이 위에서 아래로 쌓인다. 카드 바로 아래에 그 자신의 틈이 붙는다.
 *
 * 🔴 드롭은 카드 전체(`<section>`)가 받는다 — 마우스가 정확히 어느 상자 위에 있는지는 안 본다.
 * 트랙이 안 바뀌므로(위 참고) 놓일 자리는 **이 카드 안에서 끄는 티켓의 트랙과 같은 상자** 하나로
 * 이미 정해져 있다 — 그 상자가 있으면 그 상자만 빛나고(`TrackGroup`), 없으면 가상 상자
 * (`GhostTrackGroup`)로 자리를 보여준다. 카드 테두리 전체를 빛내지 않는다 — "화면은 빛나는데
 * 정작 [정확한 자리로] 못 간다" 는 오해를 만들지 않기 위해서다.
 */
function StepCard({
  row,
  highlighted,
  dragging,
  onMoveToStep,
  onTicketDragStart,
  onTicketDragEnd,
  onInsertAfterStep,
  onOpenDoc,
}: {
  row: StepRow;
  highlighted: ReadonlySet<string>;
  dragging: DraggingTicket | null;
  onMoveToStep: (feature: string, ticket: string, step: number) => void;
  onTicketDragStart: (feature: string, ticket: string) => void;
  onTicketDragEnd: () => void;
  onInsertAfterStep: (feature: string, ticket: string, afterStep: number) => void;
  onOpenDoc: OpenDocFn;
}) {
  const [isOver, setIsOver] = useState(false);
  const matchingTrack = dragging ? row.byTrack.find((g) => g.track === dragging.track) : undefined;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <section
        onDragOver={(e) => {
          if (!isTicketDrag(e) || !dragging) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setIsOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsOver(false);
        }}
        onDrop={(e) => {
          if (!isTicketDrag(e) || !dragging) return;
          e.preventDefault();
          setIsOver(false);
          const data = readTicketDragData(e);
          if (!data) return;
          onMoveToStep(data.feature, data.ticket, row.step); // 트랙은 그대로 — 이 보기는 트랙을 안 바꾼다
        }}
        className="min-w-0 rounded-lg border border-border bg-surface p-3"
      >
        <h3 className="mono mb-2 text-sm font-medium text-muted">단계 {row.step}</h3>
        <div className="flex min-w-0 flex-col gap-3">
          {row.byTrack.map((g) => (
            <TrackGroup
              key={g.track}
              track={g.track}
              chips={g.chips}
              highlighted={highlighted}
              isDropTarget={isOver && dragging !== null && dragging.track === g.track}
              onTicketDragStart={onTicketDragStart}
              onTicketDragEnd={onTicketDragEnd}
              onOpenDoc={onOpenDoc}
            />
          ))}
          {isOver && dragging && !matchingTrack && <GhostTrackGroup track={dragging.track} />}
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
 * 🔴 티켓 칩을 끌면 **단계만** 바뀐다 — 어느 상자에 놓든, 카드 배경에 놓든 트랙은 그대로다
 * (티켓 04 §표, 캡틴 피드백 2026-08-11). 트랙은 기능 보기에서 기능 카드를 끌어야 바뀐다.
 */
export function StepView({
  features,
  order,
  highlighted,
  onMoveToStep,
  onInsertAfterStep,
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
