import { describe, expect, it } from "vitest";
import { insertStepAfter } from "./step";

describe("insertStepAfter — 줄 사이에 놓으면 새 단계가 생기고 뒤가 밀린다(spec 04 §무엇이 바뀌나, 🔴 첫 커버)", () => {
  it("이웃 단계 뒤에 끼우면 그 값 + 1을 받는다", () => {
    expect(insertStepAfter(1)).toEqual({ newStep: 2, shiftFrom: 2 });
  });

  it("shiftFrom 은 새 단계와 같다 — 그 값 이상이던 기존 단계가 전부 밀린다", () => {
    const { newStep, shiftFrom } = insertStepAfter(3);
    expect(shiftFrom).toBe(newStep);
  });

  it("맨 앞(0 뒤)에 끼우면 1을 받는다", () => {
    expect(insertStepAfter(0)).toEqual({ newStep: 1, shiftFrom: 1 });
  });
});
