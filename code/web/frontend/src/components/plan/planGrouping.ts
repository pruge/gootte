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

/**
 * 단계 보기 — 카드는 **단계**를 나타내고, 그 안에서 티켓을 **트랙별로 묶어** 보여준다(캡틴 지시
 * 2026-08-11: "카드는 단계를 표시하고 그 안에 track 별 ticket으로 묶어 표시하라"). 트랙 이름은
 * 칩과 같은 줄을 공유하지 않는다(라벨 위·칩 아래로 블록을 쌓는다) — 트랙 이름 칸을 칩이
 * 침범하던 원래 버그는 "같은 줄에 라벨+칩을 나란히 두는 것" 자체가 원인이었다.
 */
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

/**
 * 남은 티켓이 없다 — 티켓이 있고 전부 done/dropped(development-order/16 ②). 티켓이 0개인 기능은
 * 안 가라앉는다 — "끝났다는 증거가 없다"(core `sortFeatures` 의 `RANK_NO_TICKETS` 와 같은 기준).
 * 문서를 못 찾은 기능(계획에만 있고 폴더가 없는 어긋남)도 안 가라앉는다 — 모른다를 "끝났다"로 접지 않는다.
 */
function hasNoOpenWork(doc: Feature | undefined): boolean {
  return doc !== undefined && doc.tickets.length > 0 && doc.tickets.every((t) => t.status === "done" || t.status === "dropped");
}

/**
 * 기능 보기 — 트랙(세로줄) 안에 기능 카드를 순위대로, 카드마다 그 기능의 티켓과 단계.
 *
 * 🔴 development-order/16 ② — 남은 티켓이 없는 기능은 트랙 끝으로 가라앉는다. **보이는 순서만**
 * 바꾼다 — 저장된 `rank` 값은 안 건드리고(INV-5), 살아 있는 기능들 사이 순서(rank 오름차순)도
 * 한 칸 안 바뀐다. 티켓이 새로 생기면 다음 읽기에서 `hasNoOpenWork` 가 저절로 false 가 되어
 * 제 rank 자리로 돌아온다 — 별도 상태를 저장하지 않는다(매 read 재계산, INV-1).
 */
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
    .map(([track, lanes]) => {
      const byRank = lanes.slice().sort((a, b) => a.rank - b.rank);
      const alive = byRank.filter((l) => !hasNoOpenWork(featureBySlug.get(l.feature)));
      const sunk = byRank.filter((l) => hasNoOpenWork(featureBySlug.get(l.feature)));
      return { track, features: [...alive, ...sunk] };
    });
}

/** `next` 버튼이 켜졌을 때 강조할 "지금 나란히" 집합 — 02 의 순수 함수 결과를 그대로 읽는다. */
export function nextKeySet(next: NextResult): Set<string> {
  const keys = new Set<string>();
  for (const track of next.tracks) for (const t of track.tickets) keys.add(`${t.feature}/${t.ticket}`);
  return keys;
}
