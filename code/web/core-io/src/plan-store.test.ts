import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { dropOrder, readPlanOrder, setFeatureOrder, setTicketOrder } from "./plan-store";

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
});
