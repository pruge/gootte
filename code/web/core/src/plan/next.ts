/**
 * `next` 계산 — 자리만 비워 둔다(plan-board/01 §지우는 것, spec §next).
 * 옛 트랙·순위·어긋남 기반 계산은 걷어냈다. 05 가 다섯 자리 모델의 새 규칙으로 다시 쓴다.
 */
export function computeNext(): { available: false } {
  return { available: false };
}
