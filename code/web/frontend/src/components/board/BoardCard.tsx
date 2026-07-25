import { IconPlayerPlayFilled } from "@tabler/icons-react";
import type { PlanItem } from "@gootte/contract";
import { StatusChip } from "../common/states";

/** 칸반 카드 (Linear 룩) — 밀도 높은 이니셔티브 카드. blocked=미충족 dep 강조. */
export function BoardCard({ item, blocked = false }: { item: PlanItem; blocked?: boolean }) {
  return (
    <article
      className={`rounded-md border px-3 py-2 transition-colors ${
        item.now ? "border-accent/50 bg-accent/5" : "border-border bg-surface hover:border-muted/50"
      }`}
    >
      <div className="flex items-center gap-1.5">
        {item.now && (
          <span className="mono inline-flex shrink-0 items-center gap-0.5 rounded bg-accent px-1 py-0.5 text-sm font-semibold text-accent-fg">
            <IconPlayerPlayFilled size={8} /> NOW
          </span>
        )}
        <h3 className="truncate text-base font-medium tracking-tight">{item.initiative}</h3>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <StatusChip status={item.status} />
        {item.track && (
          <span
            className="mono rounded bg-surface-2 px-1.5 py-0.5 text-sm text-muted"
            title={`대분류 ${item.track.key} — ${item.track.label}`}
          >
            {item.track.key} {item.track.label}
          </span>
        )}
        {item.subSteps.length > 0 && (
          <span className="mono text-sm text-muted">{item.subSteps.length} 할일</span>
        )}
        {item.deps.length > 0 && (
          <span className={`mono text-sm ${blocked ? "text-drop" : "text-muted"}`}>
            ← {item.deps.join(", ")}
          </span>
        )}
      </div>
    </article>
  );
}
