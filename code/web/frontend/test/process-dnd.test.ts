import { describe, expect, it } from "vitest";
import type { ProcessRow, ProcessStepGroup } from "@gootte/core/plan";
import {
  dragId,
  parseDragId,
  parseDropTarget,
  findRow,
  ON_STEP_ID,
  GAP_ID,
  UNRANKED_ID,
} from "../src/components/process/dnd";

const row = (feature: string, ticket: string, title = "제목"): ProcessRow => ({
  feature,
  ticket,
  num: "01",
  title,
  checked: false,
});

describe("process/dnd — 끌기 id ↔ 계약 값(plan-board/08)", () => {
  it("dragId ↔ parseDragId 는 서로의 역함수다", () => {
    expect(parseDragId(dragId("auth-login", "01-x"))).toEqual({
      feature: "auth-login",
      ticket: "01-x",
    });
  });

  it("parseDragId — '/' 가 없으면 null", () => {
    expect(parseDragId("no-slash")).toBeNull();
  });

  it("parseDropTarget — onStep", () => {
    expect(parseDropTarget(ON_STEP_ID(3))).toEqual({ kind: "onStep", displayStep: 3 });
  });

  it("parseDropTarget — gap", () => {
    expect(parseDropTarget(GAP_ID(0))).toEqual({ kind: "gap", index: 0 });
  });

  it("parseDropTarget — unranked", () => {
    expect(parseDropTarget(UNRANKED_ID)).toEqual({ kind: "unranked" });
  });

  it("parseDropTarget — 알 수 없는 id 는 null", () => {
    expect(parseDropTarget("area:active")).toBeNull();
  });

  it("findRow — 묶음들 사이에서 feature/ticket 이 맞는 줄을 찾는다", () => {
    const groups: ProcessStepGroup[] = [
      { step: 1, rows: [row("a", "01-x", "가")] },
      { step: 2, rows: [row("b", "02-x", "나")] },
    ];
    expect(findRow(groups, dragId("b", "02-x"))).toEqual(row("b", "02-x", "나"));
  });

  it("findRow — 없으면 null", () => {
    const groups: ProcessStepGroup[] = [{ step: 1, rows: [row("a", "01-x")] }];
    expect(findRow(groups, dragId("ghost", "99-x"))).toBeNull();
  });
});
