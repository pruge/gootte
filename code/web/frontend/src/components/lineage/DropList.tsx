import { IconArrowNarrowRight } from "@tabler/icons-react";
import type { DropRecord } from "@gootte/contract";

/** drop — todo → resolvedBy(무엇이 흡수/대체). resolvedBy 는 verbatim(요약 X, INV-4). */
export function DropList({ drops }: { drops: DropRecord[] }) {
  if (drops.length === 0) return null;
  return (
    <section aria-labelledby="drop-heading">
      <h2 id="drop-heading" className="mono mb-2 text-xs tracking-[0.2em] text-muted">
        ── drop ({drops.length}) ──
      </h2>
      <ul className="space-y-1.5">
        {drops.map((d, i) => (
          <li key={`${d.todo}-${i}`} className="border-l-2 border-drop/40 py-1 pl-3 text-sm">
            <div className="flex flex-wrap items-baseline gap-1.5">
              <span className="mono text-muted">{d.todo}</span>
              <IconArrowNarrowRight size={14} className="shrink-0 text-border" />
              <span className="mono text-drop">{d.resolvedBy}</span>
            </div>
            {d.initiative && (
              <p className="mono pl-1 text-[0.65rem] text-muted opacity-70">↳ {d.initiative}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
