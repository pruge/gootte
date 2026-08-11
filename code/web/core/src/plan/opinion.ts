import type { OpinionTrigger, PlanOrder, TicketOrderEntry } from "@gootte/contract";

/**
 * 판단이 필요한 자리 셋(spec 06 §버튼이 뜨는 조건) — 순수 함수, 매 읽기 계산(INV-1·INV-4).
 * `computeNext`(02)·`checkTicketDragWarnings`(04)와 판정 자리를 겹치지 않는다 — 이 함수만 이 셋을 본다.
 * 🔴 결과는 저장하지 않는다 — 캡틴이 버튼을 눌러야만 `opinion_request` 한 줄이 생긴다.
 */

function ticketNumKey(num: string): number {
  const n = Number(num);
  return Number.isNaN(n) ? 0 : n;
}

/** 한 기능의 티켓 사이에 다른 기능이 끼어들었다 — 티켓 번호 순으로 이웃한 두 단계 사이에 남의 단계가 있다. */
function detectCrossed(tickets: readonly TicketOrderEntry[]): OpinionTrigger[] {
  const byFeature = new Map<string, TicketOrderEntry[]>();
  for (const t of tickets) {
    const list = byFeature.get(t.feature) ?? [];
    list.push(t);
    byFeature.set(t.feature, list);
  }

  const triggers: OpinionTrigger[] = [];
  for (const [feature, entries] of byFeature) {
    const sorted = [...entries].sort((a, b) => ticketNumKey(a.ticket) - ticketNumKey(b.ticket));
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i] as TicketOrderEntry;
      const b = sorted[i + 1] as TicketOrderEntry;
      const lo = Math.min(a.step, b.step);
      const hi = Math.max(a.step, b.step);
      if (hi - lo <= 1) continue; // 사이에 낄 자리가 없다
      const between = tickets.filter((t) => t.feature !== feature && t.step > lo && t.step < hi);
      if (between.length === 0) continue;
      const interlopers = [...new Set(between.map((t) => t.feature))].sort().join(", ");
      triggers.push({
        kind: "ticket_crossed",
        feature,
        step: null,
        detail: `${feature}/${a.ticket}(단계 ${a.step})와 ${feature}/${b.ticket}(단계 ${b.step}) 사이에 ${interlopers} 가 끼어들었다 — 이대로 괜찮은지 봐 달라`,
      });
    }
  }
  return triggers;
}

/** 서로 다른 기능의 티켓이 같은 단계에 놓였다 — 정말 무관한지는 사람이 본다. */
function detectNewParallel(tickets: readonly TicketOrderEntry[]): OpinionTrigger[] {
  const byStep = new Map<number, Set<string>>();
  for (const t of tickets) {
    const set = byStep.get(t.step) ?? new Set<string>();
    set.add(t.feature);
    byStep.set(t.step, set);
  }

  const triggers: OpinionTrigger[] = [];
  for (const [step, features] of byStep) {
    if (features.size < 2) continue;
    triggers.push({
      kind: "new_parallel",
      feature: null,
      step,
      detail: `단계 ${step}에 서로 다른 기능(${[...features].sort().join(", ")})이 나란히 놓였다 — 정말 무관한지 봐 달라`,
    });
  }
  return triggers.sort((a, b) => (a.step ?? 0) - (b.step ?? 0));
}

/** `왜_확인필요` 가 선 자리 — 새 판정이 아니라 티켓 04 가 드래그에서 이미 세운 표시를 그대로 읽는다. */
function detectWhyFlipped(order: PlanOrder): OpinionTrigger[] {
  const triggers: OpinionTrigger[] = [];
  for (const f of order.features) {
    if (!f.whyNeedsReview) continue;
    triggers.push({
      kind: "why_flipped",
      feature: f.feature,
      step: null,
      detail: `${f.feature} 의 트랙·순위가 바뀌었는데 "왜" 는 그대로다 — 다시 써야 하는지 봐 달라`,
    });
  }
  for (const t of order.tickets) {
    if (!t.whyNeedsReview) continue;
    triggers.push({
      kind: "why_flipped",
      feature: t.feature,
      step: t.step,
      detail: `${t.feature}/${t.ticket} 의 단계가 바뀌었는데 "왜" 는 그대로다 — 다시 써야 하는지 봐 달라`,
    });
  }
  return triggers;
}

/** 버튼이 뜨는 자리 전부 — 조건 셋을 합친다. 아무것도 없으면 빈 배열(버튼도 안 뜬다). */
export function detectOpinionTriggers(order: PlanOrder): OpinionTrigger[] {
  return [...detectCrossed(order.tickets), ...detectNewParallel(order.tickets), ...detectWhyFlipped(order)];
}

/**
 * 버튼을 누른 그 순간의 배치 스냅샷 — verbatim, 나중에 더 끄셔도 흔들리지 않는다(spec 06 §배치 요약).
 */
export function formatPlanSnapshot(order: PlanOrder): string {
  const lines: string[] = [`project: ${order.project}`, "", "features:"];
  if (order.features.length === 0) lines.push("  (없음)");
  for (const f of order.features) {
    lines.push(`  [${f.track}] rank=${f.rank} ${f.feature} — ${f.why}`);
  }
  lines.push("", "tickets:");
  if (order.tickets.length === 0) lines.push("  (없음)");
  for (const t of order.tickets) {
    lines.push(`  step=${t.step} ${t.feature}/${t.ticket} — ${t.why}`);
  }
  return lines.join("\n");
}
