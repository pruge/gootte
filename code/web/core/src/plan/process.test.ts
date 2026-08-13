import { describe, expect, it } from "vitest";
import type { PlanCard } from "@gootte/contract";
import { UNRANKED_STEP } from "./move";
import { groupProcessSteps } from "./process";
import { feature, resolved } from "./fixtures";

const card = (
  slug: string,
  tickets: Parameters<typeof feature>[1],
  steps: Record<string, number>,
): PlanCard => ({ feature: feature(slug, tickets), seq: 0, closedAt: null, steps });

describe("groupProcessSteps — 이미 계산된 표시 단계를 다시 묶기만 한다(plan-board/07)", () => {
  it("여러 기능이 한 단계에 섞인다 — 기능으로는 묶이지 않는다", () => {
    const cards = [
      card("a", ["01", "04"], { "01-x": 1, "04-x": 1 }),
      card("b", ["01"], { "01-x": 1 }),
    ];
    expect(groupProcessSteps(cards)).toEqual([
      {
        step: 1,
        rows: [
          { feature: "a", ticket: "01-x", num: "01", title: "티켓 01", checked: false, unread: false },
          { feature: "a", ticket: "04-x", num: "04", title: "티켓 04", checked: false, unread: false },
          { feature: "b", ticket: "01-x", num: "01", title: "티켓 01", checked: false, unread: false },
        ],
      },
    ]);
  });

  it("빈 단계가 없다 — 입력에 실린 단계 번호를 그대로 오름차순으로 묶는다", () => {
    const cards = [card("a", ["01"], { "01-x": 1 }), card("b", ["02"], { "02-x": 2 })];
    expect(groupProcessSteps(cards).map((g) => g.step)).toEqual([1, 2]);
  });

  it("9999 뿐이면 그 한 묶음만 있고, 번호 매겨진 단계는 없다", () => {
    const cards = [card("a", ["01"], { "01-x": UNRANKED_STEP })];
    expect(groupProcessSteps(cards)).toEqual([
      {
        step: UNRANKED_STEP,
        rows: [{ feature: "a", ticket: "01-x", num: "01", title: "티켓 01", checked: false, unread: false }],
      },
    ]);
  });

  it("9999 는 번호 매겨진 단계들 뒤, 맨 끝에 선다", () => {
    const cards = [
      card("a", ["01"], { "01-x": UNRANKED_STEP }),
      card("b", ["02"], { "02-x": 1 }),
    ];
    expect(groupProcessSteps(cards).map((g) => g.step)).toEqual([1, UNRANKED_STEP]);
  });

  it("단계가 하나도 없으면 빈 묶음 목록", () => {
    expect(groupProcessSteps([])).toEqual([]);
    // steps 가 비어 있는 카드(작업 대상 밖에서 온 카드) — 값 없는 티켓은 어디에도 나오지 않는다.
    expect(groupProcessSteps([card("a", ["01"], {})])).toEqual([]);
  });

  it("완료 티켓도 그 단계가 아직 점유돼 있으면 상자만 채워진 채 함께 나온다", () => {
    const cards = [card("a", [resolved("01", "2026-08-01"), "02"], { "01-x": 1, "02-x": 1 })];
    expect(groupProcessSteps(cards)).toEqual([
      {
        step: 1,
        rows: [
          { feature: "a", ticket: "01-x", num: "01", title: "티켓 01", checked: true, unread: false },
          { feature: "a", ticket: "02-x", num: "02", title: "티켓 02", checked: false, unread: false },
        ],
      },
    ]);
  });
});
