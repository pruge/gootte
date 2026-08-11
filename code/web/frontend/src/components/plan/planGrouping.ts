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

export interface StepColumnRow {
  step: number;
  /** 이 트랙에 이 단계 티켓이 없어도 자리는 유지된다(빈 배열) — 비었다는 것도 정보다(티켓 09 ③). */
  chips: StepChip[];
}

export interface StepColumn {
  track: string;
  rows: StepColumnRow[];
}

export interface StepColumns {
  /** 전체 계획을 가로지르는 단계 목록(정렬됨) — 모든 칸이 **같은 이 목록**으로 행을 만들어야
   * 같은 단계가 칸들 사이에서 같은 높이에 선다(spec §같은 단계 = 병렬). */
  steps: readonly number[];
  columns: StepColumn[];
}

/**
 * 단계 보기(티켓 09 ③) — 기능 보기와 같은 얼개: 트랙마다 세로 칸. 칸 안에는 **단계별로** 티켓이 놓인다.
 * 어느 트랙에 그 단계가 비어 있어도 `rows` 에 빈 자리를 남긴다 — 화면이 이 자리로 subgrid 높이를 맞춘다.
 * 트랙을 한 줄로 펴지 않는다(티켓 03 금지 조항) — `groupByTrackFeature` 와 같은 트랙 발견 방식을 쓴다.
 */
export function groupByTrackStep(features: readonly Feature[], order: PlanOrder): StepColumns {
  const trackByFeature = new Map(order.features.map((f) => [f.feature, f.track]));
  const docByKey = ticketDocByKey(features);

  const steps = [...new Set(order.tickets.map((t) => t.step))].sort((a, b) => a - b);
  const tracks = new Set<string>();
  for (const f of order.features) tracks.add(f.track);
  for (const t of order.tickets) tracks.add(trackByFeature.get(t.feature) ?? UNASSIGNED_TRACK);

  const columns: StepColumn[] = [...tracks]
    .sort((a, b) => a.localeCompare(b))
    .map((track) => ({ track, rows: steps.map((step) => ({ step, chips: [] as StepChip[] })) }));
  const columnByTrack = new Map(columns.map((c) => [c.track, c]));
  const rowIndexByStep = new Map(steps.map((s, i) => [s, i]));

  for (const o of order.tickets) {
    const track = trackByFeature.get(o.feature) ?? UNASSIGNED_TRACK;
    const column = columnByTrack.get(track);
    const rowIdx = rowIndexByStep.get(o.step);
    if (!column || rowIdx === undefined) continue;
    column.rows[rowIdx]?.chips.push({
      feature: o.feature,
      ticketNum: o.ticket,
      ticket: docByKey.get(`${o.feature}/${o.ticket}`) ?? null,
      whyNeedsReview: o.whyNeedsReview,
    });
  }

  return { steps, columns };
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
