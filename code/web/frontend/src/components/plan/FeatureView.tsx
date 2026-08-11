import type { Feature, PlanOrder } from "@gootte/contract";
import { Empty } from "../common/states";
import { groupByTrackFeature } from "./planGrouping";
import { TicketChip } from "./TicketChip";

interface FeatureViewProps {
  features: readonly Feature[];
  order: PlanOrder;
  highlighted: ReadonlySet<string>;
}

/**
 * 기능 보기 — 트랙이 세로줄, 그 안에 기능 카드가 순위대로(spec §두 보기).
 * 🔴 트랙을 한 줄로 펴지 않는다 — 트랙마다 자기 칸을 갖는다.
 */
export function FeatureView({ features, order, highlighted }: FeatureViewProps) {
  const lanes = groupByTrackFeature(features, order);
  if (lanes.length === 0) return <Empty>계획된 트랙이 없습니다.</Empty>;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {lanes.map((lane) => (
        <section
          key={lane.track}
          className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface p-3"
        >
          <h3 className="mono text-sm font-medium text-muted">{lane.track}</h3>
          {lane.features.map((f) => (
            <div key={f.feature} className="min-w-0 rounded-md border border-border/60 bg-surface-2/40 p-2">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="min-w-0 truncate text-sm font-medium">{f.title}</span>
                <span className="mono shrink-0 text-xs text-muted">rank={f.rank}</span>
                {f.whyNeedsReview && (
                  <span className="mono shrink-0 rounded bg-partial/15 px-1 py-0.5 text-xs text-partial">
                    확인 필요
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-muted" title={f.why}>
                {f.why}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {f.tickets.map((t) => (
                  <TicketChip
                    key={t.ticketNum}
                    feature={f.feature}
                    ticketNum={t.ticketNum}
                    ticket={t.ticket}
                    highlighted={highlighted.has(`${f.feature}/${t.ticketNum}`)}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
