/**
 * 티켓 단계 삽입 — 순수 함수(spec 04 §무엇이 바뀌나 "줄과 줄 사이 → 새 단계가 생긴다(뒤 단계가 밀린다)").
 * 화면(티켓 04)의 드래그가 이 함수로 새 단계 값을 계산한다 — `step` 은 정수라 기능 순위(`rank.ts`)의
 * 중간값 방식을 못 쓴다. 대신 이웃 뒤로 한 칸씩 밀어 자리를 만든다.
 */

export interface StepInsertion {
  /** 삽입된 티켓이 받을 새 단계 값. */
  newStep: number;
  /** 이 값 이상이던 기존 단계는(끌리는 티켓 자신은 제외) +1 씩 밀린다 — 프로젝트 전체. */
  shiftFrom: number;
}

/** `beforeStep` 다음 줄과의 사이에 놓았을 때. */
export function insertStepAfter(beforeStep: number): StepInsertion {
  const newStep = beforeStep + 1;
  return { newStep, shiftFrom: newStep };
}
