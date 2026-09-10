import type { Feature } from "@gootte/contract";

/** `frontier` 한 줄 — 착수 가능 티켓 하나. */
export interface FrontierTicket {
  feature: string;
  ticket: string;
  title: string;
  /** 캡틴 눈 표시 — 이미 계산된 값을 그대로 싣는다(INV-E1). 받는 쪽이 다시 세지 않는다. */
  needsCaptainEye: boolean;
}

/**
 * frontier(착수 가능 티켓) 계산 — **대기(pending) + 차단 없음(startable) + 임자 없음**.
 *
 * 🔴 판정 자리는 선행 계산에 이미 있는 값 둘뿐이다(INV-4) — `ticket.status`(레코드·문서·백로그
 * 조인 뒤의 최종 상태)와 `ticket.startable`(features.ts `toTicket` 이 "선행이 모두 풀렸고
 * 임자가 없다" 로 세팅한 값, backlog-join 이 신관례를 재판정). 여기서 새로 추정하지 않는다.
 *
 * 옛 포맷(`Blocked by:` 줄이 아예 없는 티켓)은 파서가 `blockedBy: []` 로 판정한다 —
 * "차단 없음"이 결정적 규칙이다(parse/feature.ts). 읽지 못하는 산문 선행은
 * `unreadableBlockedBy` 로 막힌 채 남아(보수적) frontier 에 실리지 않는다.
 *
 * `in_sprint` 는 제외다 — 스프린트가 이미 점유한 티켓이라 "임자 없음"이 아니며, 착수 가능 집계
 * (verify-header-badge)와 같은 술어를 유지한다.
 */
export function computeFrontier(features: readonly Feature[]): FrontierTicket[] {
  const out: FrontierTicket[] = [];
  for (const f of features) {
    for (const t of [...f.tickets, ...(f.newTickets ?? [])]) {
      if (t.status !== "pending" || !t.startable) continue;
      out.push({ feature: f.slug, ticket: t.slug, title: t.title, needsCaptainEye: t.needsCaptainEye });
    }
  }
  return out;
}
