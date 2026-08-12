import { describe, expect, it } from "vitest";
import { UNRANKED_STEP, type StepRow } from "./move";
import { computeDisplaySteps, placeStep } from "./step";
import { feature, resolved, row, wontfix } from "./fixtures";

const s = (feat: string, ticket: string, step: number): StepRow => ({
  feature: feat,
  ticket: `${ticket}-x`,
  step,
});

describe("computeDisplaySteps — 당김은 표시 계산이다(INV-B2, plan-board/05)", () => {
  it("빈 단계 하나 — 1이 비면 2·3이 1·2로 당겨진다", () => {
    const features = [feature("a", [resolved("01", "2026-08-01")]), feature("b", ["02"]), feature("c", ["03"])];
    const placements = [row("a", "active", 0), row("b", "active", 1), row("c", "active", 2)];
    const steps = [s("a", "01", 1), s("b", "02", 2), s("c", "03", 3)];
    expect(computeDisplaySteps(features, placements, steps)).toEqual({
      b: { "02-x": 1 },
      c: { "03-x": 2 },
    });
  });

  it("빈 단계 여럿 — 1과 3이 비면 2·4가 1·2로 당겨진다", () => {
    const features = [
      feature("a", [resolved("01", "2026-08-01")]),
      feature("b", ["02"]),
      feature("c", [resolved("03", "2026-08-01")]),
      feature("d", ["04"]),
    ];
    const placements = [
      row("a", "active", 0),
      row("b", "active", 1),
      row("c", "active", 2),
      row("d", "active", 3),
    ];
    const steps = [s("a", "01", 1), s("b", "02", 2), s("c", "03", 3), s("d", "04", 4)];
    expect(computeDisplaySteps(features, placements, steps)).toEqual({
      b: { "02-x": 1 },
      d: { "04-x": 2 },
    });
  });

  it("전부 빈 경우 — 표시 단계가 하나도 없다", () => {
    const features = [feature("a", [resolved("01", "2026-08-01")]), feature("b", [resolved("02", "2026-08-01")])];
    const placements = [row("a", "active", 0), row("b", "active", 1)];
    const steps = [s("a", "01", 1), s("b", "02", 2)];
    expect(computeDisplaySteps(features, placements, steps)).toEqual({});
  });

  it("작업 대상 밖 기능이 섞이면 그 티켓은 계산에서 빠진다", () => {
    const features = [feature("a", ["01"]), feature("b", ["02"])];
    // b 는 예약 칸 — 단계 행이 남아 있어도(옛 값) 무시한다.
    const placements = [row("a", "active", 0), row("b", "reserved", 0)];
    const steps = [s("a", "01", 1), s("b", "02", 1)];
    expect(computeDisplaySteps(features, placements, steps)).toEqual({ a: { "01-x": 1 } });
  });

  it("🔴 한 단계에 티켓이 하나라도 안 끝났으면 당기지 않는다", () => {
    const features = [feature("a", [resolved("01", "2026-08-01"), "02"]), feature("b", ["03"])];
    const placements = [row("a", "active", 0), row("b", "active", 1)];
    // a 의 두 티켓이 같은 1단계, b 는 2단계 — a-02 가 아직 안 끝나 1단계는 안 비었다.
    const steps = [s("a", "01", 1), s("a", "02", 1), s("b", "03", 2)];
    expect(computeDisplaySteps(features, placements, steps)).toEqual({
      a: { "01-x": 1, "02-x": 1 },
      b: { "03-x": 2 },
    });
  });

  it("🔴 9999 는 당기지 않는다 — 늘 9999 그대로 맨 뒤에 남는다", () => {
    const features = [feature("a", [resolved("01", "2026-08-01")]), feature("b", ["02"])];
    const placements = [row("a", "active", 0), row("b", "active", 1)];
    const steps = [s("a", "01", 1), s("b", "02", UNRANKED_STEP)];
    expect(computeDisplaySteps(features, placements, steps)).toEqual({
      b: { "02-x": UNRANKED_STEP },
    });
  });

  it("🔴 폐기 티켓은 완료가 아니다 — 그 단계는 안 비운다", () => {
    const features = [feature("a", [wontfix("01")]), feature("b", ["02"])];
    const placements = [row("a", "active", 0), row("b", "active", 1)];
    const steps = [s("a", "01", 1), s("b", "02", 2)];
    expect(computeDisplaySteps(features, placements, steps)).toEqual({
      a: { "01-x": 1 },
      b: { "02-x": 2 },
    });
  });

  it("문서에서 사라진 티켓의 옛 단계 행은 무시한다", () => {
    const features = [feature("a", ["01"])];
    const placements = [row("a", "active", 0)];
    const steps = [s("a", "01", 1), s("a", "99", 2)];
    expect(computeDisplaySteps(features, placements, steps)).toEqual({ a: { "01-x": 1 } });
  });
});

describe("placeStep — 놓은 자리 → 저장 숫자(plan-board/08)", () => {
  it("이미 있는 단계 위 — 그 단계가 원래 쓰던 저장 숫자를 그대로 돌려준다", () => {
    const features = [feature("a", ["01"]), feature("b", ["02"])];
    const placements = [row("a", "active", 0), row("b", "active", 1)];
    const steps = [s("a", "01", 1), s("b", "02", 2)];
    expect(placeStep(features, placements, steps, { kind: "onStep", displayStep: 2 })).toBe(2);
  });

  it("단계와 단계 사이 — 앞뒤 저장 숫자의 중간값", () => {
    const features = [feature("a", ["01"]), feature("b", ["02"])];
    const placements = [row("a", "active", 0), row("b", "active", 1)];
    const steps = [s("a", "01", 1), s("b", "02", 2)];
    expect(placeStep(features, placements, steps, { kind: "gap", index: 1 })).toBe(1.5);
  });

  it("맨 앞 — 가장 작은 저장 숫자 − 1", () => {
    const features = [feature("a", ["01"]), feature("b", ["02"])];
    const placements = [row("a", "active", 0), row("b", "active", 1)];
    const steps = [s("a", "01", 1), s("b", "02", 2)];
    expect(placeStep(features, placements, steps, { kind: "gap", index: 0 })).toBe(0);
  });

  it("번호 매겨진 단계들 맨 뒤 — 가장 큰 저장 숫자 + 1, 9999 무더기 앞", () => {
    const features = [feature("a", ["01"]), feature("b", ["02"])];
    const placements = [row("a", "active", 0), row("b", "active", 1)];
    const steps = [s("a", "01", 1), s("b", "02", 2), s("a", "02", UNRANKED_STEP)];
    expect(placeStep(features, placements, steps, { kind: "gap", index: 2 })).toBe(3);
  });

  it("번호 매겨진 단계가 하나도 없을 때 맨 뒤 — 1", () => {
    const features = [feature("a", ["01"])];
    const placements = [row("a", "active", 0)];
    const steps = [s("a", "01", UNRANKED_STEP)];
    expect(placeStep(features, placements, steps, { kind: "gap", index: 0 })).toBe(1);
  });

  it("9999 무더기 위 — 늘 9999", () => {
    const features = [feature("a", ["01"])];
    const placements = [row("a", "active", 0)];
    const steps = [s("a", "01", 1)];
    expect(placeStep(features, placements, steps, { kind: "unranked" })).toBe(UNRANKED_STEP);
  });

  it("🔴 전부 완료돼 화면에서 걷힌 단계가 중간에 있어도 맨 뒤 숫자가 그 숫자와 안 부딪친다", () => {
    // a-01 은 1단계에서 완료돼 화면에서 걷혔지만 저장 숫자 1은 여전히 살아 있다.
    // b 는 표시 1단계(저장 2), c 는 표시 2단계(저장 3) — 화면만 보면 "맨 뒤 + 1" 이 3+1=4 지만
    // 저장 전부를 보면 이미 3까지 쓰였으므로 여전히 4 — 이 테스트는 저장 1이 안 부딪치는 경계를 잰다.
    const features = [
      feature("a", [resolved("01", "2026-08-01")]),
      feature("b", ["02"]),
      feature("c", ["03"]),
    ];
    const placements = [row("a", "active", 0), row("b", "active", 1), row("c", "active", 2)];
    const steps = [s("a", "01", 1), s("b", "02", 2), s("c", "03", 3)];
    expect(placeStep(features, placements, steps, { kind: "gap", index: 2 })).toBe(4);
    expect(placeStep(features, placements, steps, { kind: "gap", index: 0 })).toBe(0);
  });

  it("🔴 맨 앞도 저장 전부에서 가장 작은 것을 본다 — 걷힌 단계가 가장 작을 때", () => {
    const features = [
      feature("a", [resolved("01", "2026-08-01")]),
      feature("b", ["02"]),
    ];
    const placements = [row("a", "active", 0), row("b", "active", 1)];
    const steps = [s("a", "01", 1), s("b", "02", 2)];
    // a-01 은 완료돼 화면에서 걷혔다(표시로는 b 만 1단계) — 그래도 저장 1은 여전히 살아 있어
    // 맨 앞은 1 - 1 = 0 이어야지, 화면에 보이는 값(2) 기준의 1 이 되면 안 된다.
    expect(placeStep(features, placements, steps, { kind: "gap", index: 0 })).toBe(0);
  });
});
