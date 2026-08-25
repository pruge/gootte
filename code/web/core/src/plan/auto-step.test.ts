import { describe, expect, test } from "vitest";
import type { FeatureTicket } from "@gootte/contract";
import { feature, type TicketSpec } from "./fixtures";
import { assignSteps } from "./auto-step";
import { UNRANKED_STEP } from "./move";

/**
 * `assignSteps` 의 배정 규칙(steps-start-from-dependencies/T02 인수기준 1~5).
 * 심기 자리(`planMove`)와의 접합은 `move.test.ts` 가, 화면 압축은 `step.test.ts` 가 각각 지킨다.
 */
const stepsOf = (...tickets: readonly (string | TicketSpec)[]) => {
  const f = feature("f", tickets);
  const map = assignSteps(f.tickets);
  return Object.fromEntries(f.tickets.map((t) => [t.num, map.get(t.slug)])) as Record<string, number>;
};

describe("assignSteps — 의존 위상에서 단계를 계산한다", () => {
  test("의존 없는 티켓은 전부 1단계다(인수기준 1)", () => {
    expect(stepsOf("01", "02", "03")).toEqual({ "01": 1, "02": 1, "03": 1 });
  });

  test("선형 의존이면 선행보다 한 단계 뒤다(인수기준 2)", () => {
    expect(
      stepsOf("01", { num: "02", blockedBy: ["01"] }, { num: "03", blockedBy: ["02"] }),
    ).toEqual({ "01": 1, "02": 2, "03": 3 });
  });

  test("같은 선행을 기다리는 티켓 둘은 단계를 공유한다(인수기준 3)", () => {
    expect(
      stepsOf("01", { num: "02", blockedBy: ["01"] }, { num: "03", blockedBy: ["01"] }),
    ).toEqual({ "01": 1, "02": 2, "03": 2 });
  });

  test("여러 선행 중 가장 늦은 것 뒤에 선다 — 마름모", () => {
    expect(
      stepsOf(
        "01",
        { num: "02", blockedBy: ["01"] },
        { num: "03", blockedBy: ["01"] },
        { num: "04", blockedBy: ["02", "03"] },
      ),
    ).toEqual({ "01": 1, "02": 2, "03": 2, "04": 3 });
  });

  test("순환에 걸린 티켓은 9999 로 남고, 순환 밖의 배정은 계속된다(F3, 인수기준 4)", () => {
    expect(
      stepsOf(
        { num: "01", blockedBy: ["02"] },
        { num: "02", blockedBy: ["01"] },
        "03",
        { num: "04", blockedBy: ["03"] },
      ),
    ).toEqual({ "01": UNRANKED_STEP, "02": UNRANKED_STEP, "03": 1, "04": 2 });
  });

  test("순환을 기다리는 티켓도 설 수 없다 — 선행이 없으면 뒤도 없다", () => {
    expect(
      stepsOf(
        { num: "01", blockedBy: ["02"] },
        { num: "02", blockedBy: ["01"] },
        { num: "03", blockedBy: ["02"] },
      ),
    ).toEqual({ "01": UNRANKED_STEP, "02": UNRANKED_STEP, "03": UNRANKED_STEP });
  });

  test("자기 자신을 가리키는 의존도 순환이다", () => {
    expect(stepsOf("01", { num: "02", blockedBy: ["02"] })).toEqual({
      "01": 1,
      "02": UNRANKED_STEP,
    });
  });

  test("존재하지 않는 번호를 가리키면 9999 로 남는다(인수기준 5)", () => {
    expect(stepsOf("01", { num: "02", blockedBy: ["09"] })).toEqual({
      "01": 1,
      "02": UNRANKED_STEP,
    });
  });

  test("번호로 해소되지 않는 산문 의존(development-order/17)도 관계를 모르는 티켓이다", () => {
    expect(stepsOf("01", { num: "02", blockedBy: ["자매 기능이 먼저 끝나야"] })).toEqual({
      "01": 1,
      "02": UNRANKED_STEP,
    });
  });

  test("번호 매기기는 정수 기준이다 — 파일명 '01' 과 항목 '1' 은 같은 선행", () => {
    expect(stepsOf("01", { num: "02", blockedBy: ["1"] })).toEqual({ "01": 1, "02": 2 });
  });

  test("끝난 티켓도 그래프에는 선다 — 남은 티켓은 끝난 선행 다음 단계를 받는다(D2 와의 경계)", () => {
    // 행을 빼는 것(D2)은 planMove 의 몫이고, 이 함수는 상태를 보지 않는다.
    const f = feature("f", [
      { num: "01", status: "done" },
      { num: "02", blockedBy: ["01"] },
    ]);
    const map = assignSteps(f.tickets);
    expect(map.get(f.tickets[0]!.slug)).toBe(1);
    expect(map.get(f.tickets[1]!.slug)).toBe(2);
  });

  test("빈 기능은 빈 지도를 내놓는다", () => {
    expect(assignSteps([]).size).toBe(0);
  });
});
