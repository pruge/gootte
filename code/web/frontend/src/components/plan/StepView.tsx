import { useState, type ReactNode } from "react";
import type { Feature, PlanOrder } from "@gootte/contract";
import { Empty } from "../common/states";
import { groupByStep } from "./planGrouping";
import { TicketChip } from "./TicketChip";
import { StepGap } from "./StepGap";
import { isTicketDrag, readTicketDragData } from "./dragPayload";

interface StepViewProps {
  features: readonly Feature[];
  order: PlanOrder;
  highlighted: ReadonlySet<string>;
  onMoveToStep: (feature: string, ticket: string, step: number) => void;
  onInsertAfterStep: (feature: string, ticket: string, afterStep: number) => void;
}

/**
 * 단계 줄 하나 — 그 위에 놓으면(줄과 합친다) 그 티켓의 단계가 이 줄 값이 된다.
 * 끄는 동안 놓일 자리가 눈에 보여야 한다(캡틴 확인 항목 1) — 테두리 강조로 알린다.
 */
function StepRowDropTarget({
  step,
  onDrop,
  children,
}: {
  step: number;
  onDrop: (feature: string, ticket: string) => void;
  children: ReactNode;
}) {
  const [active, setActive] = useState(false);
  return (
    <section
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
        if (data) onDrop(data.feature, data.ticket);
      }}
      className={`rounded-lg border p-3 transition-colors ${
        active ? "border-accent bg-accent/10" : "border-border bg-surface"
      }`}
    >
      <h3 className="mono mb-2 text-sm text-muted">단계 {step}</h3>
      {children}
    </section>
  );
}

/**
 * 단계 보기(기본) — 단계가 가로줄. 같은 줄에 있으면 병렬(spec §두 보기).
 * 🔴 트랙을 한 줄로 펴지 않는다 — 같은 단계 안에서도 트랙별로 나눠 그린다.
 * 티켓 칩을 다른 줄로 끌면 그 단계로, 줄과 줄 사이(`StepGap`)에 놓으면 새 단계가 생긴다(티켓 04).
 */
export function StepView({ features, order, highlighted, onMoveToStep, onInsertAfterStep }: StepViewProps) {
  const rows = groupByStep(features, order);
  if (rows.length === 0) return <Empty>계획된 단계가 없습니다.</Empty>;

  return (
    <div className="flex flex-col">
      <StepGap afterStep={0} onInsertAfterStep={onInsertAfterStep} />
      {rows.map((row) => (
        <div key={row.step} className="flex flex-col gap-1">
          <StepRowDropTarget step={row.step} onDrop={(feature, ticket) => onMoveToStep(feature, ticket, row.step)}>
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
                        whyNeedsReview={c.whyNeedsReview}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </StepRowDropTarget>
          <StepGap afterStep={row.step} onInsertAfterStep={onInsertAfterStep} />
        </div>
      ))}
    </div>
  );
}
