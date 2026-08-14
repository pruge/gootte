import type { Feature, Placement } from "@gootte/contract";
import type { StepRow } from "./move";
import { computeDisplaySteps } from "./step";

/** `next` 한 줄 — 표시 기준 1단계 티켓 하나. */
export interface NextTicket {
  feature: string;
  ticket: string;
  title: string;
  /** 이 티켓이 캡틴 눈을 필요로 하는가 — gootte 가 이미 계산한 값 그대로(INV-E1). 받는 쪽은
   * 다시 세지 않는다(the-eye-mark-comes-from-one-place/01). */
  needsCaptainEye: boolean;
}

/**
 * `next` 계산(spec §next, plan-board/05) — 작업 대상에 있는 기능의, 표시 기준 **1단계** 티켓만.
 * 트랙 묶음도 어긋남도 만들지 않는다(INV-B3). 정렬은 카드 순서(`seq`) 다음 티켓 slug.
 *
 * 🔴 판정 자리는 `computeDisplaySteps` 하나뿐이다 — 화면(카드)과 이 함수가 같은 값을 본다
 * (spec §판정 자리는 하나뿐. 화면과 명령이 같은 함수를 쓴다).
 *
 * 🔴 이미 완료·폐기된 티켓은 표시 1단계로 남아 있어도 내보내지 않는다 — "다음" 을 알리는
 * 명령이 끝난 일까지 부르면 그 순간부터 이름이 거짓말이 된다.
 */
export function computeNext(
  features: readonly Feature[],
  placements: readonly Placement[],
  steps: readonly StepRow[],
): NextTicket[] {
  const display = computeDisplaySteps(features, placements, steps);
  const featureOf = new Map(features.map((f) => [f.slug, f]));
  const seqOf = new Map(placements.filter((p) => p.area === "active").map((p) => [p.feature, p.seq]));

  const out: (NextTicket & { seq: number })[] = [];
  for (const [feature, tickets] of Object.entries(display)) {
    const seq = seqOf.get(feature);
    const f = featureOf.get(feature);
    if (seq === undefined || !f) continue;
    for (const [ticket, step] of Object.entries(tickets)) {
      if (step !== 1) continue;
      const t = f.tickets.find((x) => x.slug === ticket);
      if (!t || t.status === "done" || t.status === "dropped") continue;
      out.push({ feature, ticket, title: t.title, needsCaptainEye: t.needsCaptainEye, seq });
    }
  }

  out.sort((a, b) => a.seq - b.seq || a.ticket.localeCompare(b.ticket));
  return out.map(({ feature, ticket, title, needsCaptainEye }) => ({
    feature,
    ticket,
    title,
    needsCaptainEye,
  }));
}
