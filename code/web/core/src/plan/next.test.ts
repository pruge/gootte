import { describe, expect, it } from "vitest";
import type { Feature, FeatureOrderEntry, FeatureTicket, NextTrack, TicketOrderEntry } from "@gootte/contract";
import { computeMismatches, computeNext } from "./next";

function only(tracks: readonly NextTrack[]): NextTrack {
  expect(tracks).toHaveLength(1);
  return tracks[0] as NextTrack;
}

function ticket(num: string, overrides: Partial<FeatureTicket> = {}): FeatureTicket {
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
    ...overrides,
  };
}

function feature(slug: string, tickets: FeatureTicket[]): Feature {
  return { slug, title: slug, status: "pending", sourceStatus: null, statusKnown: true, tickets, docs: [] };
}

function featureOrder(feature: string, track: string, rank: number): FeatureOrderEntry {
  return { project: "p", feature, track, rank, why: "…", whyNeedsReview: false, updatedAt: "t" };
}

function ticketOrder(feature: string, ticket: string, step: number, why = "…"): TicketOrderEntry {
  return { project: "p", feature, ticket, step, kind: "planned", why, whyNeedsReview: false, updatedAt: "t" };
}

describe("computeNext — 트랙마다 지금 나란히 보낼 수 있는 것(spec §next 의 정의)", () => {
  it("같은 단계 둘 → 둘 다 나온다(병렬 집합)", () => {
    const features = [feature("a", [ticket("01"), ticket("02")])];
    const featureOrders = [featureOrder("a", "web", 10)];
    const ticketOrders = [ticketOrder("a", "01", 1), ticketOrder("a", "02", 1)];
    const result = computeNext(features, featureOrders, ticketOrders);
    const track = only(result.tracks);
    expect(track.step).toBe(1);
    expect(track.tickets.map((t) => t.ticket).sort()).toEqual(["01", "02"]);
  });

  it("앞 단계가 전부 완료 → 다음 단계가 열린다", () => {
    const features = [feature("a", [ticket("01", { status: "done" }), ticket("02")])];
    const featureOrders = [featureOrder("a", "web", 10)];
    const ticketOrders = [ticketOrder("a", "01", 1), ticketOrder("a", "02", 2)];
    const result = computeNext(features, featureOrders, ticketOrders);
    const track = only(result.tracks);
    expect(track.step).toBe(2);
    expect(track.tickets.map((t) => t.ticket)).toEqual(["02"]);
  });

  it("단계는 열렸는데 막힘 → 안 나오고 이유가 나온다", () => {
    const features = [feature("a", [ticket("01", { startable: false, waitingOn: ["02"] })])];
    const featureOrders = [featureOrder("a", "web", 10)];
    const ticketOrders = [ticketOrder("a", "01", 1)];
    const result = computeNext(features, featureOrders, ticketOrders);
    const track = only(result.tracks);
    expect(track.tickets).toEqual([]);
    expect(track.emptyReason).toBe("all_blocked");
  });

  it("임자 있는 티켓은 next 에서 빠진다", () => {
    const features = [
      feature("a", [ticket("01", { startable: false, sourceStatus: "claimed", waitingOn: [] })]),
    ];
    const featureOrders = [featureOrder("a", "web", 10)];
    const ticketOrders = [ticketOrder("a", "01", 1)];
    const result = computeNext(features, featureOrders, ticketOrders);
    const track = only(result.tracks);
    expect(track.tickets).toEqual([]);
    expect(track.emptyReason).toBe("all_claimed");
  });

  it("트랙이 다르면 따로 답한다 — 병렬 트랙", () => {
    const features = [feature("a", [ticket("01")]), feature("b", [ticket("01")])];
    const featureOrders = [featureOrder("a", "web", 10), featureOrder("b", "backend", 10)];
    const ticketOrders = [ticketOrder("a", "01", 1), ticketOrder("b", "01", 1)];
    const result = computeNext(features, featureOrders, ticketOrders);
    expect(result.tracks.map((t) => t.track).sort()).toEqual(["backend", "web"]);
  });

  it("단계가 전부 없는 트랙 — no_steps", () => {
    const result = computeNext([], [], []);
    expect(result.tracks).toEqual([]);
  });

  it("트랙의 단계가 전부 완료 — all_done", () => {
    const features = [feature("a", [ticket("01", { status: "done" })])];
    const featureOrders = [featureOrder("a", "web", 10)];
    const ticketOrders = [ticketOrder("a", "01", 1)];
    const result = computeNext(features, featureOrders, ticketOrders);
    const track = only(result.tracks);
    expect(track.step).toBeNull();
    expect(track.emptyReason).toBe("all_done");
  });
});

describe("computeMismatches — 어긋남 세 종류(spec §어긋남 세 줄)", () => {
  it("단계 없는 티켓", () => {
    const features = [feature("a", [ticket("01")])];
    const mismatches = computeMismatches(features, []);
    expect(mismatches).toEqual([
      { kind: "ticket_without_step", feature: "a", ticket: "01", detail: "a/01 — 계획에 단계가 없다" },
    ]);
  });

  it("티켓 없는 단계", () => {
    const mismatches = computeMismatches([], [ticketOrder("a", "01", 1)]);
    expect(mismatches).toEqual([
      {
        kind: "step_without_ticket",
        feature: "a",
        ticket: "01",
        step: 1,
        detail: "a/01 — 단계 1에 있지만 티켓 문서가 없다",
      },
    ]);
  });

  it("끝났는데 앞 단계에 남은 것", () => {
    const features = [feature("a", [ticket("01", { status: "done" })])];
    const mismatches = computeMismatches(features, [ticketOrder("a", "01", 1)]);
    expect(mismatches).toEqual([
      {
        kind: "done_but_staged",
        feature: "a",
        ticket: "01",
        step: 1,
        detail: "a/01 — 이미 끝났는데 단계 1에 남아 있다",
      },
    ]);
  });

  it("완료된 티켓이 계획에 없는 것은 어긋남이 아니다(단계 없는 티켓 제외 대상)", () => {
    const features = [feature("a", [ticket("01", { status: "done" })])];
    expect(computeMismatches(features, [])).toEqual([]);
  });
});
