import { IconGitCompare } from "@tabler/icons-react";
import type { PlanMismatch } from "@gootte/contract";

const LABEL: Record<PlanMismatch["kind"], string> = {
  ticket_without_step: "단계 없는 티켓",
  step_without_ticket: "티켓 없는 단계",
  done_but_staged: "끝났는데 앞 단계에 남은 것",
  blocked_by_unreadable: "번호 없는 막힘",
  unblocked_but_delayed: "막힘 없는데 뒤 단계 — 이유 없음",
  stale_reason_wording: "이유 줄이 낡았을 수 있음",
};

/**
 * 계획(DB)과 티켓(관리대상 md)의 어긋남 — 접거나 숨기지 않는다(spec §어긋남).
 * 이것이 계획과 티켓이 갈라진 것을 알아채는 유일한 자리다.
 *
 * **계획 전체의 지금 상태**를 말한다 — 방금 한 동작이 아니라 서 있는 사실이라, 없어질 때까지
 * 계속 서 있다(닫기가 없다). `DragWarningBanner`(방금 한 드래그 하나에 대한 말)와는 성격이 달라
 * 왼쪽 굵은 테두리 + 실선으로 "늘 서 있는 상태판" 처럼 보이게 한다(spec 09 §②, 색만 바꾸지 않는다).
 */
export function MismatchList({ mismatches }: { mismatches: readonly PlanMismatch[] }) {
  if (mismatches.length === 0) return null;
  return (
    <section
      role="status"
      className="overflow-hidden rounded-lg border border-partial/25 border-l-4 border-l-partial bg-partial/5"
    >
      <header className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-partial">
        <IconGitCompare size={16} className="shrink-0" />
        계획과 문서가 갈라졌습니다 — 어긋남 {mismatches.length}
      </header>
      <ul className="divide-y divide-border/60 border-t border-partial/15">
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
