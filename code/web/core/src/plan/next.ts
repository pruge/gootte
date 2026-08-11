import type {
  Feature,
  FeatureOrderEntry,
  FeatureTicket,
  NextEmptyReason,
  NextResult,
  NextTrack,
  PlanMismatch,
  TicketOrderEntry,
} from "@gootte/contract";

/**
 * `next` 계산 — 순수 함수(spec §🔴 순수 함수로 짓는다, 티켓 02). 입력은 이미 만들어진
 * `Feature[]`(막힘·임자·완료는 여기서 이미 계산돼 있다 — `startable`) 와 계획 줄들(DB 에서 읽은 그대로),
 * 출력은 트랙별 "지금 나란히 보낼 수 있는 것" + 어긋남 세 줄.
 *
 * 🔴 막힘·임자 판정을 새로 만들지 않는다 — `FeatureTicket.startable` 을 그대로 읽는다(INV-1).
 * 화면(티켓 03)의 `next` 버튼이 나중에 이 함수를 그대로 쓴다 — 판정 자리는 하나뿐이어야 한다.
 */

const doneOrDropped = (t: FeatureTicket): boolean => t.status === "done" || t.status === "dropped";
const ticketKey = (feature: string, ticket: string): string => `${feature}/${ticket}`;

/**
 * 계획(DB)과 티켓(관리대상 md)의 어긋남 세 종류 — 감추지 않는다(spec §어긋남 세 줄).
 * `order` 와 `next` 양쪽이 이 함수를 같이 쓴다.
 */
export function computeMismatches(
  features: readonly Feature[],
  ticketOrders: readonly TicketOrderEntry[],
): PlanMismatch[] {
  const docByKey = new Map<string, FeatureTicket>();
  for (const f of features) for (const t of f.tickets) docByKey.set(ticketKey(f.slug, t.num), t);

  const plannedKeys = new Set(ticketOrders.map((o) => ticketKey(o.feature, o.ticket)));

  const mismatches: PlanMismatch[] = [];

  for (const f of features) {
    for (const t of f.tickets) {
      if (doneOrDropped(t)) continue;
      const key = ticketKey(f.slug, t.num);
      if (!plannedKeys.has(key)) {
        mismatches.push({
          kind: "ticket_without_step",
          feature: f.slug,
          ticket: t.num,
          detail: `${f.slug}/${t.num} — 계획에 단계가 없다`,
        });
      }
      // `Blocked by:` 에 번호도 "없음" 도 못 알아들은 산문이 있다 — 막지 않되(startable 계산에서
      // 이미 빠져 있다) 조용히 사라지지 않게 여기서 드러낸다(development-order/11).
      for (const raw of t.unreadableBlockedBy) {
        mismatches.push({
          kind: "blocked_by_unreadable",
          feature: f.slug,
          ticket: t.num,
          detail: `${f.slug}/${t.num} — Blocked by: 를 못 읽었다 — "${raw}"`,
        });
      }
    }
  }

  for (const o of ticketOrders) {
    const key = ticketKey(o.feature, o.ticket);
    const doc = docByKey.get(key);
    if (!doc) {
      mismatches.push({
        kind: "step_without_ticket",
        feature: o.feature,
        ticket: o.ticket,
        step: o.step,
        detail: `${o.feature}/${o.ticket} — 단계 ${o.step}에 있지만 티켓 문서가 없다`,
      });
      continue;
    }
    if (doneOrDropped(doc)) {
      mismatches.push({
        kind: "done_but_staged",
        feature: o.feature,
        ticket: o.ticket,
        step: o.step,
        detail: `${o.feature}/${o.ticket} — 이미 끝났는데 단계 ${o.step}에 남아 있다`,
      });
    }
  }

  return mismatches;
}

const UNASSIGNED_TRACK = "(트랙 미지정)";

function computeTrackNext(
  track: string,
  orders: readonly TicketOrderEntry[],
  ticketByKey: ReadonlyMap<string, FeatureTicket>,
): NextTrack {
  if (orders.length === 0) return { track, step: null, tickets: [], emptyReason: "no_steps" };

  const steps = [...new Set(orders.map((o) => o.step))].sort((a, b) => a - b);

  for (const step of steps) {
    const known = orders
      .filter((o) => o.step === step)
      .map((order) => ({ order, ticket: ticketByKey.get(ticketKey(order.feature, order.ticket)) }))
      .filter((x): x is { order: TicketOrderEntry; ticket: FeatureTicket } => x.ticket !== undefined);

    if (known.length === 0) continue; // 전부 어긋남(step_without_ticket)으로 이미 잡혔다 — 다음 단계로

    if (known.every((x) => doneOrDropped(x.ticket))) continue; // 이 단계는 끝났다 — 다음 단계로

    const pending = known.filter((x) => !doneOrDropped(x.ticket));
    const eligible = pending.filter((x) => x.ticket.startable);

    if (eligible.length > 0) {
      return {
        track,
        step,
        tickets: eligible.map((x) => ({
          feature: x.order.feature,
          ticket: x.order.ticket,
          title: x.ticket.title,
          why: x.order.why,
        })),
        emptyReason: null,
      };
    }

    const allBlocked = pending.every((x) => x.ticket.waitingOn.length > 0);
    const allClaimed = pending.every((x) => x.ticket.sourceStatus === "claimed");
    const reason: NextEmptyReason = allBlocked ? "all_blocked" : allClaimed ? "all_claimed" : "mixed";
    return { track, step, tickets: [], emptyReason: reason };
  }

  return { track, step: null, tickets: [], emptyReason: "all_done" };
}

/**
 * 트랙마다 가장 앞선 미완료 단계의, 착수 가능한 티켓 전부 — "지금 동시에 보낼 수 있는 목록"
 * (spec §next 의 정의). 트랙은 `feature_order.track` 에서 온다 — 기능이 아직 `set-feature` 로
 * 등록 안 됐으면 `(트랙 미지정)` 한 묶음에 모은다(감추지 않는다).
 */
export function computeNext(
  features: readonly Feature[],
  featureOrders: readonly FeatureOrderEntry[],
  ticketOrders: readonly TicketOrderEntry[],
): NextResult {
  const trackByFeature = new Map<string, string>();
  for (const fo of featureOrders) trackByFeature.set(fo.feature, fo.track);

  const ticketByKey = new Map<string, FeatureTicket>();
  for (const f of features) for (const t of f.tickets) ticketByKey.set(ticketKey(f.slug, t.num), t);

  const byTrack = new Map<string, TicketOrderEntry[]>();
  for (const o of ticketOrders) {
    const track = trackByFeature.get(o.feature) ?? UNASSIGNED_TRACK;
    const list = byTrack.get(track) ?? [];
    list.push(o);
    byTrack.set(track, list);
  }

  const tracks = [...byTrack.entries()]
    .map(([track, orders]) => computeTrackNext(track, orders, ticketByKey))
    .sort((a, b) => a.track.localeCompare(b.track));

  return { tracks, mismatches: computeMismatches(features, ticketOrders) };
}
