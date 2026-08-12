import { describe, it, expect } from "vitest";
import { featureDescription } from "../src/components/plan/cardTitle";

describe("featureDescription — 카드 두 줄 중 설명문구(캡틴 결정)", () => {
  it("표제 앞에 겹쳐 붙은 기능 이름을 뗀다", () => {
    expect(
      featureDescription("ticket-row-repair — 할일 목록 한 줄이 거짓말하지 않는다", "ticket-row-repair"),
    ).toBe("할일 목록 한 줄이 거짓말하지 않는다");
  });

  it("하이픈·엔대시·콜론 구분기호도 같이 뗀다", () => {
    expect(featureDescription("plan-board – 판", "plan-board")).toBe("판");
    expect(featureDescription("plan-board - 판", "plan-board")).toBe("판");
    expect(featureDescription("plan-board : 판", "plan-board")).toBe("판");
  });

  it("이름이 안 겹치는 표제는 그대로 둔다 — 요약하지 않는다(INV-4)", () => {
    expect(featureDescription("계획은 판 위에서 움직인다", "plan-board")).toBe(
      "계획은 판 위에서 움직인다",
    );
  });

  it("🔴 이름으로 시작하기만 하는 다른 이름은 자르지 않는다 — 없는 제목을 지어내지 않는다", () => {
    expect(featureDescription("plan-board-extra — 딴 기능", "plan-board")).toBe(
      "plan-board-extra — 딴 기능",
    );
  });

  it("구분기호 없이 이름으로만 시작해도 손대지 않는다", () => {
    expect(featureDescription("plan-board 판 이야기", "plan-board")).toBe("plan-board 판 이야기");
  });

  it("표제가 곧 폴더명이면 설명이 없다 — 빈 문자열", () => {
    expect(featureDescription("plan-board", "plan-board")).toBe("");
  });
});
