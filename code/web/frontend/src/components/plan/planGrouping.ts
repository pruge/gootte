import type { Feature, FeatureTicket, NextResult, PlanOrder } from "@gootte/contract";

/**
 * `plan` 탭(티켓 03) 표현 계산 — 이미 서버가 보낸 값을 **화면에 배치만** 한다.
 * 막힘·착수 가능·`next` 판정은 여기서 다시 만들지 않는다(INV-1) — 서버가 계산해 보낸
 * `Feature[]`(`startable` 등)와 `NextResult` 를 그대로 읽어 줄·칸으로 접는 것뿐이다.
 */

export const UNASSIGNED_TRACK = "(트랙 미지정)";

function ticketDocByKey(features: readonly Feature[]): Map<string, FeatureTicket> {
  const map = new Map<string, FeatureTicket>();
  for (const f of features) for (const t of f.tickets) map.set(`${f.slug}/${t.num}`, t);
  return map;
}

export interface StepChip {
  feature: string;
  ticketNum: string;
  /** null = 계획엔 있는데 티켓 문서가 없다 — `step_without_ticket` 어긋남과 짝(감추지 않는다). */
  ticket: FeatureTicket | null;
  /** 드래그(티켓 04)가 단계만 바꾸고 `why` 는 안 건드렸다는 표시. */
  whyNeedsReview: boolean;
}

export interface StepTrackGroup {
  track: string;
  chips: StepChip[];
}

export interface StepRow {
  step: number;
  byTrack: StepTrackGroup[];
}

/** 단계 보기 — 같은 단계(가로줄) 안에서 트랙별로 나눠 담는다(트랙을 한 줄로 펴지 않는다). */
export function groupByStep(features: readonly Feature[], order: PlanOrder): StepRow[] {
  const trackByFeature = new Map(order.features.map((f) => [f.feature, f.track]));
  const docByKey = ticketDocByKey(features);

  const stepMap = new Map<number, Map<string, StepChip[]>>();
  for (const o of order.tickets) {
    const track = trackByFeature.get(o.feature) ?? UNASSIGNED_TRACK;
    const byTrack = stepMap.get(o.step) ?? new Map<string, StepChip[]>();
    const chips = byTrack.get(track) ?? [];
    chips.push({
      feature: o.feature,
      ticketNum: o.ticket,
      ticket: docByKey.get(`${o.feature}/${o.ticket}`) ?? null,
      whyNeedsReview: o.whyNeedsReview,
    });
    byTrack.set(track, chips);
    stepMap.set(o.step, byTrack);
  }

  return [...stepMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([step, byTrack]) => ({
      step,
      byTrack: [...byTrack.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([track, chips]) => ({ track, chips })),
    }));
}

export interface FeatureLaneTicket {
  ticketNum: string;
  ticket: FeatureTicket | null;
  step: number;
  why: string;
  whyNeedsReview: boolean;
}

export interface FeatureLane {
  feature: string;
  title: string;
  rank: number;
  why: string;
  whyNeedsReview: boolean;
  tickets: FeatureLaneTicket[];
}

export interface TrackLane {
  track: string;
  features: FeatureLane[];
}

/** 기능 보기 — 트랙(세로줄) 안에 기능 카드를 순위대로, 카드마다 그 기능의 티켓과 단계. */
export function groupByTrackFeature(features: readonly Feature[], order: PlanOrder): TrackLane[] {
  const featureBySlug = new Map(features.map((f) => [f.slug, f]));
  const ticketOrdersByFeature = new Map<string, typeof order.tickets>();
  for (const t of order.tickets) {
    const list = ticketOrdersByFeature.get(t.feature) ?? [];
    list.push(t);
    ticketOrdersByFeature.set(t.feature, list);
  }

  const byTrack = new Map<string, FeatureLane[]>();
  for (const fo of order.features) {
    const doc = featureBySlug.get(fo.feature);
    const docTicketByNum = new Map((doc?.tickets ?? []).map((t) => [t.num, t]));
    const lane: FeatureLane = {
      feature: fo.feature,
      title: doc?.title ?? fo.feature,
      rank: fo.rank,
      why: fo.why,
      whyNeedsReview: fo.whyNeedsReview,
      tickets: (ticketOrdersByFeature.get(fo.feature) ?? [])
        .slice()
        .sort((a, b) => a.step - b.step)
        .map((t) => ({
          ticketNum: t.ticket,
          ticket: docTicketByNum.get(t.ticket) ?? null,
          step: t.step,
          why: t.why,
          whyNeedsReview: t.whyNeedsReview,
        })),
    };
    const list = byTrack.get(fo.track) ?? [];
    list.push(lane);
    byTrack.set(fo.track, list);
  }

  return [...byTrack.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([track, lanes]) => ({ track, features: lanes.slice().sort((a, b) => a.rank - b.rank) }));
}

/** `next` 버튼이 켜졌을 때 강조할 "지금 나란히" 집합 — 02 의 순수 함수 결과를 그대로 읽는다. */
export function nextKeySet(next: NextResult): Set<string> {
  const keys = new Set<string>();
  for (const track of next.tracks) for (const t of track.tickets) keys.add(`${t.feature}/${t.ticket}`);
  return keys;
}
