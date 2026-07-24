import { IconPlayerPlayFilled } from "@tabler/icons-react";
import type { PlanItem } from "@gootte/contract";
import { circled } from "../../lib/format";
import { StatusChip } from "../common/states";

/** plan 한 줄 — 순서·NOW·initiative·status + subSteps(할일)·deps. 서버 값 그대로(INV-4). */
export function PlanItemRow({ item }: { item: PlanItem }) {
  return (
    <li
      className={`rounded-lg border px-4 py-3 transition-colors ${
        item.now ? "border-accent/50 bg-accent/5" : "border-border bg-surface hover:border-muted/40"
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="mono text-sm text-accent">{circled(item.order)}</span>
        {item.now && (
          <span className="mono inline-flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-[0.6rem] font-semibold text-accent-fg">
            <IconPlayerPlayFilled size={9} /> NOW
          </span>
        )}
        <span className="font-medium tracking-tight">{item.initiative}</span>
        <StatusChip status={item.status} />
        {item.track && <span className="mono text-xs text-muted">· {item.track}</span>}
      </div>

      {item.deps.length > 0 && (
        <p className="mono mt-1.5 pl-6 text-xs text-muted">← 의존: {item.deps.join(", ")}</p>
      )}

      {item.subSteps.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 pl-6">
          {item.subSteps.map((s, i) => (
            <li key={i} className="flex gap-1.5 text-sm text-muted">
              <span className="select-none text-border">
                {i === item.subSteps.length - 1 ? "└" : "├"}
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
