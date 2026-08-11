import type { Feature, PlanOrder } from "@gootte/contract";
import { Empty } from "../common/states";
import { groupByStep } from "./planGrouping";
import { TicketChip } from "./TicketChip";

interface StepViewProps {
  features: readonly Feature[];
  order: PlanOrder;
  highlighted: ReadonlySet<string>;
}

/**
 * 단계 보기(기본) — 단계가 가로줄. 같은 줄에 있으면 병렬(spec §두 보기).
 * 🔴 트랙을 한 줄로 펴지 않는다 — 같은 단계 안에서도 트랙별로 나눠 그린다.
 */
export function StepView({ features, order, highlighted }: StepViewProps) {
  const rows = groupByStep(features, order);
  if (rows.length === 0) return <Empty>계획된 단계가 없습니다.</Empty>;

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <section key={row.step} className="rounded-lg border border-border bg-surface p-3">
          <h3 className="mono mb-2 text-sm text-muted">단계 {row.step}</h3>
          <div className="flex flex-col gap-2">
            {row.byTrack.map((lane) => (
              <div key={lane.track} className="flex flex-wrap items-center gap-2">
                <span className="mono w-28 shrink-0 truncate text-xs text-muted" title={lane.track}>
                  {lane.track}
                </span>
                <div className="flex min-w-0 flex-wrap gap-2">
                  {lane.chips.map((c) => (
                    <TicketChip
                      key={`${c.feature}/${c.ticketNum}`}
                      feature={c.feature}
                      ticketNum={c.ticketNum}
                      ticket={c.ticket}
                      highlighted={highlighted.has(`${c.feature}/${c.ticketNum}`)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
