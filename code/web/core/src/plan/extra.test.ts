import { describe, expect, it } from "vitest";
import type { ExtraEntry, Feature, FeatureTicket } from "@gootte/contract";
import { annotateExtraExistence } from "./extra";

function ticket(num: string): FeatureTicket {
  return {
    num,
    slug: `${num}-x`,
    title: `티켓 ${num}`,
    status: "pending",
    sourceStatus: "ready-for-agent",
    statusKnown: true,
    blockedBy: [],
    waitingOn: [],
    startable: true,
    workedBy: [],
  };
}

function feature(slug: string, tickets: FeatureTicket[]): Feature {
  return { slug, title: slug, status: "pending", sourceStatus: null, statusKnown: true, tickets, docs: [] };
}

function extra(feature: string, ticket: string, overrides: Partial<ExtraEntry> = {}): ExtraEntry {
  return {
    id: 1,
    project: "p",
    feature,
    ticket,
    note: "…",
    who: null,
    done: false,
    createdAt: "t",
    ...overrides,
  };
}

describe("annotateExtraExistence — 없는 티켓을 가리켜도 거절하지 않고 표시한다(development-order/05, 🔴 첫 커버)", () => {
  it("가리키는 티켓이 있으면 true", () => {
    const features = [feature("a", [ticket("01")])];
    const [item] = annotateExtraExistence([extra("a", "01")], features);
    expect(item?.ticketExists).toBe(true);
  });

  it("가리키는 티켓이 없으면 false — 거절하지 않는다", () => {
    const features = [feature("a", [ticket("01")])];
    const [item] = annotateExtraExistence([extra("a", "99")], features);
    expect(item?.ticketExists).toBe(false);
  });

  it("가리키는 기능 자체가 없어도 false", () => {
    const [item] = annotateExtraExistence([extra("no-such-feature", "01")], []);
    expect(item?.ticketExists).toBe(false);
  });

  it("저장된 값을 그대로 두고 ticketExists 만 얹는다", () => {
    const features = [feature("a", [ticket("01")])];
    const [item] = annotateExtraExistence([extra("a", "01", { note: "메모", who: "firstmate" })], features);
    expect(item).toMatchObject({ note: "메모", who: "firstmate", ticketExists: true });
  });
});
