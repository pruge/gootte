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
    unreadableBlockedBy: [],
    waitingOn: [],
    startable: true,
    workedBy: [],
    needsCaptainEye: false,
    ...overrides,
  };
}

function feature(slug: string, tickets: FeatureTicket[]): Feature {
  return { slug, title: slug, status: "pending", sourceStatus: null, statusKnown: true, tickets, docs: [] };
}

function featureOrder(feature: string, track: string, rank: number, why = "…"): FeatureOrderEntry {
  return { project: "p", feature, track, rank, why, whyNeedsReview: false, updatedAt: "t" };
}

function ticketOrder(feature: string, ticket: string, step: number, why = "…"): TicketOrderEntry {
  return { project: "p", feature, ticket, step, why, whyNeedsReview: false, updatedAt: "t" };
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

  it("🔴 못 읽은 산문이 있어도 착수 가능이면 next 에 그대로 나온다(development-order/11 완료 시연)", () => {
    // catalog-registry/03: `Blocked by:` 가 꾸며 쓴 "없음" 이면 blockedBy 는 비어 startable=true.
    // unreadableBlockedBy 가 있어도(다른 이유로 못 읽은 산문이 섞였다 해도) startable 계산과
    // 무관하다 — waitingOn 은 blockedBy 만 본다. next 는 startable 만 본다.
    const features = [
      feature("a", [ticket("03", { unreadableBlockedBy: ["설명은 있는데 번호가 없다"] })]),
    ];
    const featureOrders = [featureOrder("a", "web", 10)];
    const ticketOrders = [ticketOrder("a", "03", 1)];
    const result = computeNext(features, featureOrders, ticketOrders);
    const track = only(result.tracks);
    expect(track.tickets.map((t) => t.ticket)).toEqual(["03"]);
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

describe("computeMismatches — 어긋남 여섯 종류(spec §어긋남 세 줄 + development-order/11·15)", () => {
  it("단계 없는 티켓", () => {
    const features = [feature("a", [ticket("01")])];
    const mismatches = computeMismatches(features, [], []);
    expect(mismatches).toEqual([
      { kind: "ticket_without_step", feature: "a", ticket: "01", detail: "a/01 — 계획에 단계가 없다" },
    ]);
  });

  it("티켓 없는 단계", () => {
    const mismatches = computeMismatches([], [], [ticketOrder("a", "01", 1)]);
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
    const mismatches = computeMismatches(features, [], [ticketOrder("a", "01", 1)]);
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
    expect(computeMismatches(features, [], [])).toEqual([]);
  });

  it("🔴 Blocked by 를 못 읽은 산문 — 어긋남에 verbatim 으로 오른다(development-order/11)", () => {
    const features = [
      feature("a", [ticket("01", { unreadableBlockedBy: ["디자인 논의가 아직 안 끝났다"] })]),
    ];
    const mismatches = computeMismatches(features, [], [ticketOrder("a", "01", 1)]);
    expect(mismatches).toEqual([
      {
        kind: "blocked_by_unreadable",
        feature: "a",
        ticket: "01",
        detail: 'a/01 — Blocked by: 를 못 읽었다 — "디자인 논의가 아직 안 끝났다"',
      },
    ]);
  });

  it("완료·취소된 티켓의 못 읽은 산문은 어긋남으로 세지 않는다", () => {
    const features = [
      feature("a", [
        ticket("01", { status: "done", unreadableBlockedBy: ["오래된 메모"] }),
      ]),
    ];
    expect(computeMismatches(features, [], [])).toEqual([]);
  });

  describe("① 막힘 없는데 뒤 단계 + 이유 없음(development-order/15 ①)", () => {
    it("막힘 없는데 뒤 단계 + 이유 비었음 → 어긋남", () => {
      const features = [feature("a", [ticket("01"), ticket("02")])];
      const featureOrders = [featureOrder("a", "web", 10)];
      const ticketOrders = [ticketOrder("a", "01", 1), ticketOrder("a", "02", 2, "")];
      const mismatches = computeMismatches(features, featureOrders, ticketOrders);
      expect(mismatches).toEqual([
        {
          kind: "unblocked_but_delayed",
          feature: "a",
          ticket: "02",
          step: 2,
          detail: "a/02 — 티켓은 막힘이 없다는데 단계 2(이 트랙의 선두는 1)에 있고, 계획의 이유가 비어 있다",
        },
      ]);
    });

    it("같은 상황 + 이유 적힘 → 조용하다(끄는 길)", () => {
      const features = [feature("a", [ticket("01"), ticket("02")])];
      const featureOrders = [featureOrder("a", "web", 10)];
      const ticketOrders = [ticketOrder("a", "01", 1), ticketOrder("a", "02", 2, "09 를 기다린다")];
      expect(computeMismatches(features, featureOrders, ticketOrders)).toEqual([]);
    });

    it("실제로 막혀 있으면(waitingOn 있음) 대상이 아니다", () => {
      const features = [
        feature("a", [ticket("01"), ticket("02", { startable: false, waitingOn: ["01"] })]),
      ];
      const featureOrders = [featureOrder("a", "web", 10)];
      const ticketOrders = [ticketOrder("a", "01", 1), ticketOrder("a", "02", 2, "")];
      expect(computeMismatches(features, featureOrders, ticketOrders)).toEqual([]);
    });

    it("서로 다른 트랙끼리는 비교하지 않는다(병렬 트랙 오탐 금지)", () => {
      const features = [feature("a", [ticket("01")]), feature("b", [ticket("05")])];
      const featureOrders = [featureOrder("a", "web", 10), featureOrder("b", "backend", 10)];
      const ticketOrders = [ticketOrder("a", "01", 1), ticketOrder("b", "05", 5, "")];
      expect(computeMismatches(features, featureOrders, ticketOrders)).toEqual([]);
    });

    it("그 상황에서 착수 가능 판정이 안 바뀐다 — startable 은 그대로 읽는다", () => {
      const features = [feature("a", [ticket("01"), ticket("02")])];
      const featureOrders = [featureOrder("a", "web", 10)];
      const ticketOrders = [ticketOrder("a", "01", 1), ticketOrder("a", "02", 2, "")];
      const result = computeNext(features, featureOrders, ticketOrders);
      const ticket02 = features[0]?.tickets[1];
      expect(ticket02?.startable).toBe(true);
      expect(result.mismatches.some((m) => m.kind === "unblocked_but_delayed")).toBe(true);
    });
  });

  describe("③ 이유 줄에 상태 낱말(development-order/15 ③)", () => {
    it("기능 이유에 상태 낱말 → 어긋남, 적는 것 자체는 막지 않는다", () => {
      const featureOrders = [featureOrder("a", "web", 10, "이미 다른 사람이 집어 갔고 위 둘과 안 겹친다")];
      const mismatches = computeMismatches([], featureOrders, []);
      expect(mismatches).toEqual([
        {
          kind: "stale_reason_wording",
          feature: "a",
          detail: 'a — 이유 줄에 상태를 말하는 낱말("집어 갔")이 있다. 낡았을 수 있다',
        },
      ]);
    });

    it("티켓 이유에 상태 낱말 → 어긋남", () => {
      const features = [feature("a", [ticket("01")])];
      const ticketOrders = [ticketOrder("a", "01", 1, "지금 처리중이라 미룬다")];
      const mismatches = computeMismatches(features, [], ticketOrders);
      expect(mismatches).toEqual([
        {
          kind: "stale_reason_wording",
          feature: "a",
          ticket: "01",
          step: 1,
          detail: 'a/01 — 이유 줄에 상태를 말하는 낱말("처리중")이 있다. 낡았을 수 있다',
        },
      ]);
    });

    it("🔴 오늘 실제로 쓰이는 정상 표현 '막힘 없음' 은 잘못 잡지 않는다", () => {
      const features = [feature("a", [ticket("01")])];
      const ticketOrders = [ticketOrder("a", "01", 1, "배포가 건너뛴 출력을 이름과 이유로 말한다. 막힘 없음")];
      expect(computeMismatches(features, [], ticketOrders)).toEqual([]);
    });
  });
});
