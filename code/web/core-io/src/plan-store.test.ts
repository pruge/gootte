import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { Feature, FeatureTicket } from "@gootte/contract";
import {
  dropOrder,
  dropStaleCompleted,
  insertTicketStep,
  moveFeatureOrder,
  moveTicketStep,
  readPlanOrder,
  setFeatureOrder,
  setTicketOrder,
} from "./plan-store";

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

function feature(slug: string, tickets: FeatureTicket[]): Feature {
  return { slug, title: slug, status: "pending", sourceStatus: null, statusKnown: true, tickets, docs: [] };
}

/** 임시 디렉토리 픽스처 — 이 저장소 자신의 문서를 픽스처로 쓰지 않는다(AGENTS.md §Verify gate). */
let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "gootte-plan-"));
});

describe("plan-store — 덮어쓰기만(INV-5, 이력 테이블 없음)", () => {
  it("set-feature 두 번 같은 키 → 뒤엣것만 남는다", () => {
    setFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", rank: 10, why: "먼저" });
    setFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", rank: 20, why: "나중" });
    const order = readPlanOrder(dataDir, "p");
    expect(order.features).toHaveLength(1);
    expect(order.features[0]).toMatchObject({ rank: 20, why: "나중" });
  });

  it("set 두 번 같은 티켓 → 뒤엣것만 남는다", () => {
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "먼저" });
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 2, why: "나중" });
    const order = readPlanOrder(dataDir, "p");
    expect(order.tickets).toHaveLength(1);
    expect(order.tickets[0]).toMatchObject({ step: 2, why: "나중" });
  });

  it("set — step 생략하면 기존 값 유지, kind 만 바뀐다", () => {
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 3, why: "계획" });
    const updated = setTicketOrder(dataDir, {
      project: "p",
      feature: "a",
      ticket: "01",
      kind: "interstitial",
      why: "틈틈이로 바뀜",
    });
    expect(updated.step).toBe(3);
    expect(updated.kind).toBe("interstitial");
  });

  it("처음 등록인데 step 이 없으면 거절한다", () => {
    expect(() =>
      setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", why: "…" }),
    ).toThrow(/--step/);
  });

  it("이웃 사이에 끼워도 다른 줄은 안 바뀐다", () => {
    setFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", rank: 10, why: "a" });
    setFeatureOrder(dataDir, { project: "p", feature: "b", track: "web", rank: 20, why: "b" });
    setFeatureOrder(dataDir, { project: "p", feature: "c", track: "web", rank: 15, why: "끼움" });
    const order = readPlanOrder(dataDir, "p");
    expect(order.features.map((f) => [f.feature, f.rank])).toEqual([
      ["a", 10],
      ["c", 15],
      ["b", 20],
    ]);
  });

  it("drop — 티켓 지정이면 그 티켓만, 아니면 기능 순위만 지운다", () => {
    setFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", rank: 10, why: "…" });
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "…" });
    dropOrder(dataDir, "p", "a", "01");
    let order = readPlanOrder(dataDir, "p");
    expect(order.tickets).toHaveLength(0);
    expect(order.features).toHaveLength(1);

    dropOrder(dataDir, "p", "a");
    order = readPlanOrder(dataDir, "p");
    expect(order.features).toHaveLength(0);
  });

  it("프로젝트가 다르면 섞이지 않는다(키의 일부)", () => {
    setFeatureOrder(dataDir, { project: "p1", feature: "a", track: "web", rank: 10, why: "…" });
    setFeatureOrder(dataDir, { project: "p2", feature: "a", track: "web", rank: 20, why: "…" });
    expect(readPlanOrder(dataDir, "p1").features[0]?.rank).toBe(10);
    expect(readPlanOrder(dataDir, "p2").features[0]?.rank).toBe(20);
  });

  it("history.md — 변경마다 한 줄 는다", () => {
    setFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", rank: 10, why: "…" });
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "…" });
    const history = readFileSync(join(dataDir, "history.md"), "utf8").trim().split("\n");
    expect(history).toHaveLength(2);
  });

  it("set — 새로 등록되면 whyNeedsReview 는 false", () => {
    const entry = setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "…" });
    expect(entry.whyNeedsReview).toBe(false);
  });
});

describe("moveTicketStep — 티켓 칩을 다른 단계 줄로(티켓 04, 🔴 첫 커버)", () => {
  it("단계가 바뀌고 why 는 그대로, whyNeedsReview 가 선다", () => {
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "원래 이유" });
    const moved = moveTicketStep(dataDir, { project: "p", feature: "a", ticket: "01", step: 3 });
    expect(moved).toMatchObject({ step: 3, why: "원래 이유", whyNeedsReview: true });
    const order = readPlanOrder(dataDir, "p");
    expect(order.tickets[0]).toMatchObject({ step: 3, whyNeedsReview: true });
  });

  it("다른 티켓의 단계는 안 바뀐다", () => {
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "…" });
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "02", step: 2, why: "…" });
    moveTicketStep(dataDir, { project: "p", feature: "a", ticket: "01", step: 2 });
    const order = readPlanOrder(dataDir, "p");
    const t02 = order.tickets.find((t) => t.ticket === "02");
    expect(t02).toMatchObject({ step: 2, whyNeedsReview: false });
  });

  it("계획에 없는 티켓을 옮기려 하면 거절한다", () => {
    expect(() => moveTicketStep(dataDir, { project: "p", feature: "a", ticket: "99", step: 1 })).toThrow();
  });

  it("history.md 에 drag 한 줄이 남는다", () => {
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "…" });
    moveTicketStep(dataDir, { project: "p", feature: "a", ticket: "01", step: 2 });
    const history = readFileSync(join(dataDir, "history.md"), "utf8");
    expect(history).toContain("drag p a/01");
  });
});

describe("insertTicketStep — 줄 사이에 놓으면 새 단계가 생기고 뒤가 밀린다(티켓 04, 🔴 첫 커버)", () => {
  it("새 단계를 받고 그 이후 단계는 전부 +1 씩 밀린다", () => {
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "…" });
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "02", step: 2, why: "…" });
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "03", step: 3, why: "…" });

    const moved = insertTicketStep(dataDir, { project: "p", feature: "a", ticket: "03", afterStep: 1 });
    expect(moved.step).toBe(2);

    const order = readPlanOrder(dataDir, "p");
    const byTicket = Object.fromEntries(order.tickets.map((t) => [t.ticket, t.step]));
    expect(byTicket).toEqual({ "01": 1, "03": 2, "02": 3 });
  });

  it("옮긴 티켓만 whyNeedsReview 가 선다 — 밀린 줄은 안 바뀐다", () => {
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "…" });
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "02", step: 2, why: "…" });
    setTicketOrder(dataDir, { project: "p", feature: "b", ticket: "01", step: 5, why: "…" });

    insertTicketStep(dataDir, { project: "p", feature: "a", ticket: "02", afterStep: 1 });

    const order = readPlanOrder(dataDir, "p");
    const moved = order.tickets.find((t) => t.feature === "a" && t.ticket === "02");
    const shifted = order.tickets.find((t) => t.feature === "b" && t.ticket === "01");
    expect(moved?.whyNeedsReview).toBe(true);
    expect(shifted).toMatchObject({ step: 6, whyNeedsReview: false }); // 밀렸지만 확인 필요는 안 붙는다
  });

  it("history.md 에 drag 한 줄이 남는다", () => {
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "…" });
    insertTicketStep(dataDir, { project: "p", feature: "a", ticket: "01", afterStep: 0 });
    const history = readFileSync(join(dataDir, "history.md"), "utf8");
    expect(history).toContain("drag p a/01");
    expect(history).toContain("새 단계");
  });
});

describe("moveFeatureOrder — 기능 카드를 끈다(티켓 04, 🔴 첫 커버)", () => {
  it("같은 트랙 안 이웃 사이에 끼우면 그 순위만 바뀐다 — 다른 줄은 그대로", () => {
    setFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", rank: 10, why: "…" });
    setFeatureOrder(dataDir, { project: "p", feature: "b", track: "web", rank: 20, why: "…" });

    const moved = moveFeatureOrder(dataDir, {
      project: "p",
      feature: "b",
      track: "web",
      beforeRank: 10,
      afterRank: 20,
    });
    expect(moved).toMatchObject({ rank: 15, track: "web", whyNeedsReview: true });

    const order = readPlanOrder(dataDir, "p");
    expect(order.features.find((f) => f.feature === "a")).toMatchObject({ rank: 10, whyNeedsReview: false });
  });

  it("맨 앞에 놓으면(beforeRank null) 그 이웃보다 작은 순위를 받는다", () => {
    setFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", rank: 10, why: "…" });
    setFeatureOrder(dataDir, { project: "p", feature: "b", track: "web", rank: 20, why: "…" });
    const moved = moveFeatureOrder(dataDir, { project: "p", feature: "b", track: "web", beforeRank: null, afterRank: 10 });
    expect(moved.rank).toBeLessThan(10);
  });

  it("맨 끝에 놓으면(afterRank null) 가장 큰 순위보다 크다", () => {
    setFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", rank: 10, why: "…" });
    setFeatureOrder(dataDir, { project: "p", feature: "b", track: "web", rank: 20, why: "…" });
    const moved = moveFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", beforeRank: 20, afterRank: null });
    expect(moved.rank).toBeGreaterThan(20);
  });

  it("다른 트랙으로 끌면 트랙이 바뀐다", () => {
    setFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", rank: 10, why: "…" });
    const moved = moveFeatureOrder(dataDir, {
      project: "p",
      feature: "a",
      track: "backend",
      beforeRank: null,
      afterRank: null,
    });
    expect(moved.track).toBe("backend");
    expect(moved.rank).toBe(10); // 빈 트랙의 첫 자리
  });

  it("`why` 는 그대로다", () => {
    setFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", rank: 10, why: "원래 이유" });
    const moved = moveFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", beforeRank: null, afterRank: null });
    expect(moved.why).toBe("원래 이유");
  });

  it("계획에 없는 기능을 옮기려 하면 거절한다", () => {
    expect(() =>
      moveFeatureOrder(dataDir, { project: "p", feature: "no-such", track: "web", beforeRank: null, afterRank: null }),
    ).toThrow();
  });
});

describe("dropStaleCompleted — 완료되면 스스로 빠진다(development-order/08, 🔴 첫 커버)", () => {
  it("완료된 티켓만 지우고, 지운 목록을 돌려준다", () => {
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "…" });
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "02", step: 2, why: "…" });
    const features = [feature("a", [ticket("01", { status: "done" }), ticket("02")])];

    const dropped = dropStaleCompleted(dataDir, "p", features);
    expect(dropped).toEqual([{ feature: "a", ticket: "01" }]);

    const order = readPlanOrder(dataDir, "p");
    expect(order.tickets.map((t) => t.ticket)).toEqual(["02"]);
  });

  it("wontfix(dropped)도 완료로 본다", () => {
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "…" });
    const features = [feature("a", [ticket("01", { status: "dropped" })])];
    const dropped = dropStaleCompleted(dataDir, "p", features);
    expect(dropped).toEqual([{ feature: "a", ticket: "01" }]);
  });

  it("완료 안 된 티켓은 안 건드린다", () => {
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "…" });
    const features = [feature("a", [ticket("01")])];
    expect(dropStaleCompleted(dataDir, "p", features)).toEqual([]);
    expect(readPlanOrder(dataDir, "p").tickets).toHaveLength(1);
  });

  it("다른 프로젝트의 계획은 안 건드린다", () => {
    setTicketOrder(dataDir, { project: "p1", feature: "a", ticket: "01", step: 1, why: "…" });
    setTicketOrder(dataDir, { project: "p2", feature: "a", ticket: "01", step: 1, why: "…" });
    const features = [feature("a", [ticket("01", { status: "done" })])];
    dropStaleCompleted(dataDir, "p1", features);
    expect(readPlanOrder(dataDir, "p1").tickets).toHaveLength(0);
    expect(readPlanOrder(dataDir, "p2").tickets).toHaveLength(1); // p2 는 안 건드림
  });

  it("feature_order(기능 트랙·순위)는 안 건드린다 — 티켓 줄만 지운다", () => {
    setFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", rank: 10, why: "…" });
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "…" });
    const features = [feature("a", [ticket("01", { status: "done" })])];
    dropStaleCompleted(dataDir, "p", features);
    const order = readPlanOrder(dataDir, "p");
    expect(order.features).toHaveLength(1);
    expect(order.tickets).toHaveLength(0);
  });

  it("history.md 에 drop 한 줄이 남는다", () => {
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "…" });
    const features = [feature("a", [ticket("01", { status: "done" })])];
    dropStaleCompleted(dataDir, "p", features);
    const history = readFileSync(join(dataDir, "history.md"), "utf8");
    expect(history).toContain("drop p a/01");
  });
});
