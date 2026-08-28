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

  it("🔴 신관례 전용 기능의 단계도 표시 계산에서 살아남는다 — 옛 관례만 보던 시절엔 통째로 걸러졌다", () => {
    const features = [
      feature("new-only", [
        { num: "01", newConvention: true },
        { num: "02", newConvention: true },
      ]),
    ];
    const placements = [row("new-only", "active", 0)];
    const steps: StepRow[] = [
      { feature: "new-only", ticket: "T01", step: 2 },
      { feature: "new-only", ticket: "T02", step: 3 },
    ];
    expect(computeDisplaySteps(features, placements, steps)).toEqual({
      "new-only": { T01: 1, T02: 2 },
    });
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

  it("🔴 폐기뿐인 단계는 빈다 — 뒤 단계가 당겨진다(plan-board/12, 캡틴 결정 2026-08-14)", () => {
    const features = [feature("a", [wontfix("01")]), feature("b", ["02"])];
    const placements = [row("a", "active", 0), row("b", "active", 1)];
    const steps = [s("a", "01", 1), s("b", "02", 2)];
    expect(computeDisplaySteps(features, placements, steps)).toEqual({
      b: { "02-x": 1 },
    });
  });

  it("🔴 폐기와 미완이 같은 단계에 섞이면 안 빈다 — 미완 하나가 그 단계를 붙든다", () => {
    const features = [feature("a", [wontfix("01"), "02"]), feature("b", ["03"])];
    const placements = [row("a", "active", 0), row("b", "active", 1)];
    // a 의 01(폐기)·02(미완)가 같은 1단계, b 는 2단계 — 02 가 안 끝나 1단계는 안 비었다.
    const steps = [s("a", "01", 1), s("a", "02", 1), s("b", "03", 2)];
    expect(computeDisplaySteps(features, placements, steps)).toEqual({
      a: { "01-x": 1, "02-x": 1 },
      b: { "03-x": 2 },
    });
  });

  it("문서에서 사라진 티켓의 옛 단계 행은 무시한다", () => {
    const features = [feature("a", ["01"])];
    const placements = [row("a", "active", 0)];
    const steps = [s("a", "01", 1), s("a", "99", 2)];
    expect(computeDisplaySteps(features, placements, steps)).toEqual({ a: { "01-x": 1 } });
  });

  it("🔴 문서가 사라진 기능의 배치 행이 있어도 던지지 않고, 그 카드만 빠진다(a-vanished-card-breaks-nothing)", () => {
    // gone 은 active 배치 행은 남았지만 파싱 결과(기능 문서)에 없다 — 옛 코드는
    // `featureOf.get(slug)!` 의 비-널 단언으로 여기서 통째로 죽었다.
    const features = [feature("a", ["01"]), feature("b", ["02"])];
    const placements = [row("gone", "active", 0), row("a", "active", 1), row("b", "active", 2)];
    const steps = [s("gone", "01", 1), s("a", "01", 2), s("b", "02", 3)];
    expect(() => computeDisplaySteps(features, placements, steps)).not.toThrow();
    // 살아 있는 카드의 표시는 하나도 안 바뀌고, 없어진 카드는 조용히 빠진다.
    expect(computeDisplaySteps(features, placements, steps)).toEqual({
      a: { "01-x": 1 },
      b: { "02-x": 2 },
    });
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
