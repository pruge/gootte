import { describe, expect, it } from "vitest";
import { UNRANKED_STEP, type StepRow } from "./move";
import { computeDisplaySteps } from "./step";
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
