import { describe, it, expect } from "vitest";
import type { Feature, FeatureTicket, PlanOrder } from "@gootte/contract";
import { groupByTrackFeature } from "../src/components/plan/planGrouping";

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

function order(features: PlanOrder["features"]): PlanOrder {
  return { project: "p", features, tickets: [] };
}

function orderEntry(feature: string, rank: number, overrides: Partial<PlanOrder["features"][number]> = {}) {
  return {
    project: "p",
    feature,
    track: "web",
    rank,
    why: "…",
    whyNeedsReview: false,
    updatedAt: "2026-08-11T00:00:00.000Z",
    ...overrides,
  };
}

describe("groupByTrackFeature — 끝난 기능만 트랙 끝으로 가라앉는다(development-order/16 ②)", () => {
  it("남은 티켓이 없는 기능이 트랙 끝으로 간다 — 저장된 rank 값은 안 바뀐다", () => {
    const features = [
      feature("a", [ticket("01", { status: "done" })]),
      feature("b", [ticket("01")]),
    ];
    const lanes = groupByTrackFeature(features, order([orderEntry("a", 10), orderEntry("b", 20)]));
    expect(lanes[0]!.features.map((f) => f.feature)).toEqual(["b", "a"]);
    // 보이는 순서만 바뀐다 — rank 값 자체는 원래 그대로 실려온다.
    expect(lanes[0]!.features.find((f) => f.feature === "a")?.rank).toBe(10);
    expect(lanes[0]!.features.find((f) => f.feature === "b")?.rank).toBe(20);
  });

  it("살아 있는 기능들 사이 순서는 캡틴이 정한 rank 그대로 — 한 칸도 안 바뀐다", () => {
    const features = [feature("a", [ticket("01")]), feature("b", [ticket("01")]), feature("c", [ticket("01")])];
    const lanes = groupByTrackFeature(
      features,
      order([orderEntry("a", 30), orderEntry("b", 10), orderEntry("c", 20)]),
    );
    expect(lanes[0]!.features.map((f) => f.feature)).toEqual(["b", "c", "a"]);
  });

  it("wontfix(dropped)도 완료로 본다", () => {
    const features = [feature("a", [ticket("01", { status: "dropped" })]), feature("b", [ticket("01")])];
    const lanes = groupByTrackFeature(features, order([orderEntry("a", 10), orderEntry("b", 20)]));
    expect(lanes[0]!.features.map((f) => f.feature)).toEqual(["b", "a"]);
  });

  it("티켓이 0개인 기능은 안 가라앉는다 — 끝났다는 증거가 없다", () => {
    const features = [feature("a", []), feature("b", [ticket("01", { status: "done" })])];
    const lanes = groupByTrackFeature(features, order([orderEntry("a", 10), orderEntry("b", 20)]));
    // b 만 끝났다 — a(티켓 없음)는 살아있는 자리(rank 순)에 그대로 남는다.
    expect(lanes[0]!.features.map((f) => f.feature)).toEqual(["a", "b"]);
  });

  it("계획에만 있고 문서를 못 찾은 기능은 안 가라앉는다(어긋남, 모른다를 끝났다로 접지 않는다)", () => {
    const features = [feature("b", [ticket("01")])];
    const lanes = groupByTrackFeature(features, order([orderEntry("a", 10), orderEntry("b", 20)]));
    expect(lanes[0]!.features.map((f) => f.feature)).toEqual(["a", "b"]);
  });

  it("티켓이 새로 생기면 다음 읽기에서 저절로 제 rank 자리로 돌아온다", () => {
    const doneFeatures = [feature("a", [ticket("01", { status: "done" })]), feature("b", [ticket("01")])];
    const withNewTicket = [
      feature("a", [ticket("01", { status: "done" }), ticket("02")]),
      feature("b", [ticket("01")]),
    ];
    const o = order([orderEntry("a", 10), orderEntry("b", 20)]);
    expect(groupByTrackFeature(doneFeatures, o).flatMap((l) => l.features.map((f) => f.feature))).toEqual([
      "b",
      "a",
    ]);
    expect(groupByTrackFeature(withNewTicket, o).flatMap((l) => l.features.map((f) => f.feature))).toEqual([
      "a",
      "b",
    ]);
  });

  it("가라앉은 기능도 여전히 lane.features 배열에 남는다 — 끌 수 있다", () => {
    const features = [feature("a", [ticket("01", { status: "done" })])];
    const lanes = groupByTrackFeature(features, order([orderEntry("a", 10)]));
    expect(lanes[0]!.features).toHaveLength(1);
  });
});
