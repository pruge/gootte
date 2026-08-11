import type { PlanMismatch } from "@gootte/contract";

const LABEL: Record<PlanMismatch["kind"], string> = {
  ticket_without_step: "단계 없는 티켓",
  step_without_ticket: "티켓 없는 단계",
  done_but_staged: "끝났는데 앞 단계에 남은 것",
  blocked_by_unreadable: "Blocked by 못 읽음",
};

/**
 * 계획(DB)과 티켓(관리대상 md)의 어긋남 — 접거나 숨기지 않는다(spec §어긋남).
 * 이것이 계획과 티켓이 갈라진 것을 알아채는 유일한 자리다.
 */
export function MismatchList({ mismatches }: { mismatches: readonly PlanMismatch[] }) {
  if (mismatches.length === 0) return null;
  return (
    <section role="status" className="overflow-hidden rounded-lg border border-partial/40 bg-partial/10">
      <header className="px-4 py-2 text-sm font-medium text-partial">어긋남 {mismatches.length}</header>
      <ul className="divide-y divide-border/60 border-t border-partial/25">
        {mismatches.map((m) => (
          <li key={`${m.kind}-${m.feature}-${m.ticket ?? ""}-${m.step ?? ""}`} className="px-4 py-2 text-sm">
            <span className="mono mr-2 rounded bg-surface-2 px-1.5 py-0.5 text-muted">{LABEL[m.kind]}</span>
            <span>{m.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
