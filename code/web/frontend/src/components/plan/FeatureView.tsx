import { useState, type DragEvent } from "react";
import type { Feature, PlanOrder } from "@gootte/contract";
import { Empty } from "../common/states";
import { groupByTrackFeature, type FeatureLane, type TrackLane } from "./planGrouping";
import { TicketChip } from "./TicketChip";
import { isFeatureDrag, readFeatureDragData, setFeatureDragData } from "./dragPayload";

interface FeatureViewProps {
  features: readonly Feature[];
  order: PlanOrder;
  highlighted: ReadonlySet<string>;
  onMoveFeature: (feature: string, track: string, beforeRank: number | null, afterRank: number | null) => void;
}

function DropIndicator() {
  return <div className="h-0.5 rounded-full bg-accent" />;
}

/** 기능 카드 하나 — 끌 수 있다(티켓 04). 위/아래 절반 중 어디를 지나는지로 놓일 자리를 정한다. */
function FeatureCard({
  lane,
  highlighted,
  onHoverHalf,
}: {
  lane: FeatureLane;
  highlighted: ReadonlySet<string>;
  onHoverHalf: (half: "top" | "bottom") => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => setFeatureDragData(e, lane.feature)}
      onDragOver={(e) => {
        if (!isFeatureDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = e.currentTarget.getBoundingClientRect();
        onHoverHalf(e.clientY - rect.top < rect.height / 2 ? "top" : "bottom");
      }}
      className="min-w-0 cursor-grab rounded-md border border-border/60 bg-surface-2/40 p-2 active:cursor-grabbing"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="min-w-0 truncate text-sm font-medium">{lane.title}</span>
        <span className="mono shrink-0 text-xs text-muted">rank={lane.rank}</span>
        {lane.whyNeedsReview && (
          <span className="mono shrink-0 rounded bg-partial/15 px-1 py-0.5 text-xs text-partial">확인 필요</span>
        )}
      </div>
      <p className="truncate text-xs text-muted" title={lane.why}>
        {lane.why}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {lane.tickets.map((t) => (
          <TicketChip
            key={t.ticketNum}
            feature={lane.feature}
            ticketNum={t.ticketNum}
            ticket={t.ticket}
            highlighted={highlighted.has(`${lane.feature}/${t.ticketNum}`)}
            whyNeedsReview={t.whyNeedsReview}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * 트랙 한 칸 — 기능 카드들을 순위대로. 카드 위/아래 절반을 지나면 그 자리에 놓일 선이 보인다
 * (캡틴 확인 항목 1 — 놓을 자리가 안 보이면 짐작으로 손을 뗀다).
 */
function TrackLaneColumn({
  lane,
  highlighted,
  onMoveFeature,
}: {
  lane: TrackLane;
  highlighted: ReadonlySet<string>;
  onMoveFeature: FeatureViewProps["onMoveFeature"];
}) {
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  function commitDrop(e: DragEvent<HTMLElement>) {
    if (!isFeatureDrag(e)) return;
    e.preventDefault();
    const data = readFeatureDragData(e);
    const idx = dropIndex;
    setDropIndex(null);
    if (!data || idx === null) return;
    const others = lane.features.filter((f) => f.feature !== data.feature);
    const clamped = Math.min(idx, others.length);
    const before = clamped > 0 ? (others[clamped - 1]?.rank ?? null) : null;
    const after = clamped < others.length ? (others[clamped]?.rank ?? null) : null;
    onMoveFeature(data.feature, lane.track, before, after);
  }

  return (
    <section
      onDragOver={(e) => {
        if (!isFeatureDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dropIndex === null) setDropIndex(lane.features.length);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropIndex(null);
      }}
      onDrop={commitDrop}
      className={`flex min-w-0 flex-col gap-2 rounded-lg border p-3 transition-colors ${
        dropIndex !== null ? "border-accent bg-accent/5" : "border-border bg-surface"
      }`}
    >
      <h3 className="mono text-sm font-medium text-muted">{lane.track}</h3>
      {lane.features.map((f, i) => (
        <div key={f.feature} className="flex flex-col gap-2">
          {dropIndex === i && <DropIndicator />}
          <FeatureCard
            lane={f}
            highlighted={highlighted}
            onHoverHalf={(half) => setDropIndex(half === "top" ? i : i + 1)}
          />
        </div>
      ))}
      {dropIndex === lane.features.length && <DropIndicator />}
    </section>
  );
}

/**
 * 기능 보기 — 트랙이 세로줄, 그 안에 기능 카드가 순위대로(spec §두 보기).
 * 🔴 트랙을 한 줄로 펴지 않는다 — 트랙마다 자기 칸을 갖는다.
 * 카드를 끌면 순위가, 다른 트랙에 놓으면 트랙까지 바뀐다(티켓 04).
 */
export function FeatureView({ features, order, highlighted, onMoveFeature }: FeatureViewProps) {
  const lanes = groupByTrackFeature(features, order);
  if (lanes.length === 0) return <Empty>계획된 트랙이 없습니다.</Empty>;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {lanes.map((lane) => (
        <TrackLaneColumn key={lane.track} lane={lane} highlighted={highlighted} onMoveFeature={onMoveFeature} />
      ))}
    </div>
  );
}
