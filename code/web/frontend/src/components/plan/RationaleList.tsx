import type { PlanRationale } from "@gootte/contract";

/** "왜 이 순서" — priorityBasis · 방치비용 · 정지점 · 독립성. verbatim(요약 X, INV-4). */
export function RationaleList({ rationale }: { rationale: PlanRationale[] }) {
  if (rationale.length === 0) return null;
  return (
    <section aria-labelledby="why-heading" className="border-t border-border pt-4">
      <h2 id="why-heading" className="mono mb-3 text-sm tracking-[0.2em] text-muted">
        ── 왜 이 순서 ──
      </h2>
      <ul className="space-y-2.5">
        {rationale.map((r) => (
          <li key={r.initiative} className="text-base leading-relaxed">
            <span className="font-medium">{r.initiative}</span>{" "}
            <span className="text-muted">— {r.priorityBasis}</span>
            {r.delayCost && <Detail label="방치비용">{r.delayCost}</Detail>}
            {r.stoppingPoint && <Detail label="정지점">{r.stoppingPoint}</Detail>}
            {r.independence && <Detail label="독립성">{r.independence}</Detail>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="mt-0.5 block pl-4 text-base text-muted">
      <span className="mono text-sm opacity-70">{label}:</span> {children}
    </span>
  );
}
