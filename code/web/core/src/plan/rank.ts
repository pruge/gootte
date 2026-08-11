/**
 * 기능 순위 계산 — 순수 함수(spec §모델 "순위는 성기게(10·20·30) 매긴다").
 * 화면(티켓 04)의 드래그가 나중에 이 함수를 그대로 쓴다 — 두 곳에서 각자 계산하면
 * 그 순간부터 하나는 거짓이다.
 */

const RANK_GAP = 10;
// 이 밑으로 틈이 좁아지면 중간값이 부동소수 정밀도에 묻혀 "끼웠다" 는 사실 자체가 무의미해진다 —
// 그 지점부터는 renumberSparse 로 트랙 전체를 다시 매긴다.
const MIN_GAP = 1e-6;

/** 트랙에 첫 기능을 넣을 때. */
export function firstRank(): number {
  return RANK_GAP;
}

/** 트랙 끝에 이어 붙일 때 — 가장 큰 순위 + 한 칸. */
export function appendRank(existing: readonly number[]): number {
  return existing.length === 0 ? RANK_GAP : Math.max(...existing) + RANK_GAP;
}

/**
 * 이웃 둘 사이에 끼운다 — 중간값. 틈이 `MIN_GAP` 보다 좁아 자리가 없으면 `null` 을 돌려주고,
 * 그때는 호출자가 `renumberSparse` 로 그 트랙만 다시 매긴다.
 */
export function insertBetween(before: number, after: number): number | null {
  return after - before > MIN_GAP ? (before + after) / 2 : null;
}

/** 트랙 하나를 성기게 다시 매긴다 — 순서만 보존, 값은 10·20·30·… . 틈이 다 찼을 때만 쓴다. */
export function renumberSparse(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * RANK_GAP);
}
