import { describe, expect, it } from "vitest";
import type { ProcessRow, ProcessStepGroup } from "@gootte/core/plan";
import {
  dragId,
  parseDragId,
  resolveStepDrop,
  findRow,
  ON_STEP_ID,
  UNRANKED_ID,
  EDGE_PX,
} from "../src/components/process/dnd";

const row = (feature: string, ticket: string, title = "제목"): ProcessRow => ({
  feature,
  ticket,
  num: "01",
  title,
  box: "open",
  unread: false,
  inProgress: false,
});

const RECT = { top: 100, height: 200 };

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

describe("resolveStepDrop — 카드 좌표 → 놓을 자리(캡틴 지적: 카드마다 위·아래가 늘 있어야 한다)", () => {
  it("카드 위쪽 가장자리 — 맨 앞 카드는 '맨 앞' 자리(gap 0)", () => {
    const pointerY = RECT.top + EDGE_PX / 2;
    expect(resolveStepDrop(ON_STEP_ID(1), RECT, pointerY, 3)).toEqual({
      target: { kind: "gap", index: 0 },
      card: { step: 1, edge: "before" },
    });
  });

  it("카드 위쪽 가장자리 — 가운데 카드는 '사이' 자리(gap index = step-1)", () => {
    const pointerY = RECT.top + EDGE_PX / 2;
    expect(resolveStepDrop(ON_STEP_ID(2), RECT, pointerY, 3)).toEqual({
      target: { kind: "gap", index: 1 },
      card: { step: 2, edge: "before" },
    });
  });

  it("🔴 카드 아래쪽 가장자리 — 마지막 카드가 아니어도 '사이' 자리(gap index = step)", () => {
    const pointerY = RECT.top + RECT.height - EDGE_PX / 2;
    expect(resolveStepDrop(ON_STEP_ID(1), RECT, pointerY, 3)).toEqual({
      target: { kind: "gap", index: 1 },
      card: { step: 1, edge: "after" },
    });
  });

  it("카드 아래쪽 가장자리 — 마지막 카드는 '맨 뒤' 자리(gap index = numberedCount)", () => {
    const pointerY = RECT.top + RECT.height - EDGE_PX / 2;
    expect(resolveStepDrop(ON_STEP_ID(3), RECT, pointerY, 3)).toEqual({
      target: { kind: "gap", index: 3 },
      card: { step: 3, edge: "after" },
    });
  });

  it("가장자리가 아닌 카드 안쪽은 그 단계 위(onStep)", () => {
    const pointerY = RECT.top + RECT.height / 2;
    expect(resolveStepDrop(ON_STEP_ID(2), RECT, pointerY, 3)).toEqual({
      target: { kind: "onStep", displayStep: 2 },
      card: { step: 2, edge: "whole" },
    });
  });

  it("좌표를 모르면(키보드 끌기 등) 카드 전체를 그 단계 위로 본다", () => {
    expect(resolveStepDrop(ON_STEP_ID(2), null, null, 3)).toEqual({
      target: { kind: "onStep", displayStep: 2 },
      card: { step: 2, edge: "whole" },
    });
  });

  it("9999 카드 — 번호 매겨진 단계가 있으면 늘 unranked", () => {
    const pointerY = RECT.top + 1;
    expect(resolveStepDrop(UNRANKED_ID, RECT, pointerY, 3)).toEqual({
      target: { kind: "unranked" },
      card: { step: 0, edge: "whole" },
    });
  });

  it("🔴 9999 카드 — 번호 매겨진 단계가 하나도 없으면 위쪽 가장자리가 새 단계(1)를 만든다", () => {
    const pointerY = RECT.top + EDGE_PX / 2;
    expect(resolveStepDrop(UNRANKED_ID, RECT, pointerY, 0)).toEqual({
      target: { kind: "gap", index: 0 },
      card: { step: 0, edge: "before" },
    });
  });

  it("알 수 없는 id 는 null", () => {
    expect(resolveStepDrop("area:active", RECT, RECT.top, 3)).toBeNull();
  });
});
