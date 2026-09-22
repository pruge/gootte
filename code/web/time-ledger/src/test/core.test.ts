import { describe, expect, test } from "vitest";
import { timeRecordKey, applyTimeRecords } from "../core.js";
import type { Feature, FeatureTicket, TicketTimeRecord } from "@gootte/contract";

// ── fixtures mimicking old @gootte/core behavior ──────────────────

const makeFeatureTicket = (overrides: Partial<FeatureTicket> = {}): FeatureTicket => ({
  num: "01",
  slug: "T01",
  path: "tickets/T01.md",
  title: "티켓 01",
  status: "pending" as Feature["status"],
  sourceStatus: null,
  statusKnown: true,
  completedAt: undefined,
  blockedBy: [],
  unreadableBlockedBy: [],
  waitingOn: [],
  startable: true,
  needsCaptainEye: false,
  ...overrides,
});

const makeFeature = (slug: string, tickets: FeatureTicket[]): Feature => ({
  slug,
  title: `${slug} — 제목`,
  status: "pending" as Feature["status"],
  sourceStatus: null,
  statusKnown: true,
  docs: [],
  tickets,
});

const makeRec = (overrides: Partial<TicketTimeRecord> = {}): TicketTimeRecord => ({
  startedAt: null,
  finishedAt: null,
  pauses: [],
  statusRaw: null,
  ...overrides,
});

describe("timeRecordKey — parity with old @gootte/core", () => {
  test("returns feature/ticket format", () => {
    expect(timeRecordKey("auth", "T01")).toBe("auth/T01");
  });

  test("works with nested feature slugs", () => {
    expect(timeRecordKey("my-app", "T02")).toBe("my-app/T02");
  });
});

describe("applyTimeRecords — parity with old @gootte/core", () => {
  test("records override MD parsing values (レ코드가 권위)", () => {
    const feature = makeFeature("auth", [
      makeFeatureTicket({ status: "done", sourceStatus: "resolved (2026-08-01)", startedAt: "2026-07-01T09:00:00+09:00" })
    ]);
    const records = { "auth/T01": makeRec({ startedAt: "2026-01-01T00:00:00Z", finishedAt: "2026-01-02T00:00:00Z", statusRaw: null }) };
    const result = applyTimeRecords([feature], records);
    expect(result[0]!.tickets[0]!.status).toBe("done");
    expect(result[0]!.tickets[0]!.startedAt).toBe("2026-01-01T00:00:00Z");
    expect(result[0]!.tickets[0]!.finishedAt).toBe("2026-01-02T00:00:00Z");
  });

  test("no records → all pending", () => {
    const feature = makeFeature("auth", [
      makeFeatureTicket({ status: "done", sourceStatus: "resolved (2026-08-01)" })
    ]);
    const result = applyTimeRecords([feature], {});
    expect(result[0]!.tickets[0]!.status).toBe("pending");
  });

  test("finishedAt → done regardless of statusRaw", () => {
    const feature = makeFeature("auth", [
      makeFeatureTicket({ status: "pending" })
    ]);
    const records = { "auth/T01": makeRec({ finishedAt: "2026-01-02T00:00:00Z", statusRaw: "open" }) };
    const result = applyTimeRecords([feature], records);
    expect(result[0]!.tickets[0]!.status).toBe("done");
  });

  test("startedAt → in_progress", () => {
    const feature = makeFeature("auth", [
      makeFeatureTicket({ status: "pending" })
    ]);
    const records = { "auth/T01": makeRec({ startedAt: "2026-01-01T00:00:00Z", statusRaw: "pending" }) };
    const result = applyTimeRecords([feature], records);
    expect(result[0]!.tickets[0]!.status).toBe("in_progress");
  });

  test("statusRaw without times → maps to status", () => {
    const feature = makeFeature("auth", [
      makeFeatureTicket({ status: "pending" })
    ]);
    const records = { "auth/T01": makeRec({ statusRaw: "resolved" }) };
    const result = applyTimeRecords([feature], records);
    expect(result[0]!.tickets[0]!.status).toBe("done");
  });

  test("wontfix always → dropped", () => {
    const feature = makeFeature("auth", [
      makeFeatureTicket({ status: "pending" })
    ]);
    const records = { "auth/T01": makeRec({ finishedAt: "2026-01-02T00:00:00Z", statusRaw: "wontfix" }) };
    const result = applyTimeRecords([feature], records);
    expect(result[0]!.tickets[0]!.status).toBe("dropped");
  });
});
