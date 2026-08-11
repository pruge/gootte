import { describe, expect, it } from "vitest";
import type { FeatureTicket, TicketOrderEntry } from "@gootte/contract";
import { checkTicketDragWarnings } from "./drag";

function ticket(num: string, overrides: Partial<FeatureTicket> = {}): FeatureTicket {
  return {
    num,
    slug: `${num}-x`,
    title: `티켓 ${num}`,
    status: "pending",
    sourceStatus: "ready-for-agent",
    statusKnown: true,
    blockedBy: [],
    unreadableBlockedBy: [],
    waitingOn: [],
    startable: true,
    workedBy: [],
    ...overrides,
  };
}

function ticketOrder(feature: string, ticketNum: string, step: number): TicketOrderEntry {
  return { project: "p", feature, ticket: ticketNum, step, kind: "planned", why: "…", whyNeedsReview: false, updatedAt: "t" };
}

describe("checkTicketDragWarnings — 놓는 순간 네 검사(spec 04 §놓는 순간, 🔴 첫 커버)", () => {
  it("아무 문제 없으면 빈 배열", () => {
    const t = ticket("02");
    expect(checkTicketDragWarnings(t, "a", 3, [])).toEqual([]);
  });

  it("완료된 티켓을 옮기면 already_done", () => {
    const t = ticket("01", { status: "done" });
    const warnings = checkTicketDragWarnings(t, "a", 1, []);
    expect(warnings.map((w) => w.kind)).toContain("already_done");
  });

  it("취소된(dropped) 티켓도 already_done", () => {
    const t = ticket("01", { status: "dropped" });
    expect(checkTicketDragWarnings(t, "a", 1, []).map((w) => w.kind)).toContain("already_done");
  });

  it("처리중인 티켓을 옮기면 claimed", () => {
    const t = ticket("01", { status: "in_progress" });
    expect(checkTicketDragWarnings(t, "a", 1, []).map((w) => w.kind)).toContain("claimed");
  });

  it("임자만 있고 처리중은 아닌 티켓도 claimed", () => {
    const t = ticket("01", { sourceStatus: "claimed", startable: false });
    expect(checkTicketDragWarnings(t, "a", 1, []).map((w) => w.kind)).toContain("claimed");
  });

  it("blockedBy 는 있는데 waitingOn 이 비었으면 stale_block_reason — 적힌 선행이 이미 착지했다", () => {
    const t = ticket("02", { blockedBy: ["01"], waitingOn: [] });
    expect(checkTicketDragWarnings(t, "a", 2, []).map((w) => w.kind)).toContain("stale_block_reason");
  });

  it("waitingOn 이 있어도 blockedBy 와 길이가 같으면(아직 하나도 안 풀림) stale 아님", () => {
    const t = ticket("02", { blockedBy: ["01"], waitingOn: ["01"], startable: false });
    expect(checkTicketDragWarnings(t, "a", 2, []).map((w) => w.kind)).not.toContain("stale_block_reason");
  });

  it("기다리는 티켓을 같은 단계 이상으로 보내면 blocked_regression", () => {
    const t = ticket("02", { blockedBy: ["01"], waitingOn: ["01"], startable: false });
    const orders = [ticketOrder("a", "01", 3)];
    const warnings = checkTicketDragWarnings(t, "a", 3, orders);
    expect(warnings.map((w) => w.kind)).toContain("blocked_regression");
  });

  it("기다리는 티켓이 여전히 앞 단계면 blocked_regression 아님", () => {
    const t = ticket("02", { blockedBy: ["01"], waitingOn: ["01"], startable: false });
    const orders = [ticketOrder("a", "01", 1)];
    const warnings = checkTicketDragWarnings(t, "a", 3, orders);
    expect(warnings.map((w) => w.kind)).not.toContain("blocked_regression");
  });

  it("여러 검사가 동시에 뜰 수 있다 — 서로 막지 않는다", () => {
    const t = ticket("01", { status: "done", sourceStatus: "claimed" });
    const kinds = checkTicketDragWarnings(t, "a", 1, []).map((w) => w.kind);
    expect(kinds).toContain("already_done");
    expect(kinds).toContain("claimed");
  });
});
