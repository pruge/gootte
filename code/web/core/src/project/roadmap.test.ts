import { describe, it, expect } from "vitest";
import type { StateInput } from "../state/model";
import { buildState } from "../state/build";
import { buildRoadmap } from "./roadmap";
import { UNGROUPED } from "./track";

/**
 * 완료(shipped) + 진행(active) + 예정(planned) + 폐기(superseded) 혼합.
 * shipped 이니셔티브의 done todo 는 archive 되어도 input.todos 에 남는다(core-io load 가 archive 포함).
 */
const input: StateInput = {
  ledgers: [
    { initiative: "auth-core", status: "shipped", track: "A", deps: [], events: [], supersedes: [] },
    { initiative: "device-read", status: "active", track: "B", deps: [], events: [], supersedes: [] },
    { initiative: "report-ui", status: "planned", track: "A", deps: [], events: [], supersedes: [] },
    { initiative: "legacy-proto", status: "superseded", track: "B", deps: [], events: [], supersedes: [] },
    { initiative: "misc-cleanup", status: "planned", track: null, deps: [], events: [], supersedes: [] },
  ],
  todos: [
    // auth-core = 완료 (전부 done, archive 포함)
    { slug: "a1", status: "done", priority: "high", initiative: "auth-core", created: "2026-06-01" },
    { slug: "a2", status: "done", priority: "normal", initiative: "auth-core", created: "2026-06-02" },
    // device-read = 진행 (일부 done, 일부 남음 + dropped 1)
    { slug: "d1", status: "done", priority: "high", initiative: "device-read", created: "2026-07-01" },
    { slug: "d2", status: "in_progress", priority: "high", initiative: "device-read", created: "2026-07-02" },
    { slug: "d3", status: "pending", priority: "normal", initiative: "device-read", created: "2026-07-03" },
    { slug: "d4", status: "dropped", priority: "low", initiative: "device-read", created: "2026-07-04" },
    // report-ui = 예정 (전부 pending)
    { slug: "r1", status: "pending", priority: "normal", initiative: "report-ui", created: "2026-07-05" },
  ],
  sprints: [],
  worktrees: [],
  specPresent: [],
  indexOrder: ["device-read", "auth-core", "report-ui", "misc-cleanup", "legacy-proto"],
  tracks: new Map([
    ["A", "인증/사용자"],
    ["B", "디바이스 연동"],
  ]),
};

describe("018 buildRoadmap — 완료 포함 roadmap + 할일 재구성", () => {
  const state = buildState(input);
  const { items, trackOrder } = buildRoadmap(state);

  it("superseded 제외, 나머지 전부 포함(완료 shipped 포함)", () => {
    const slugs = items.map((i) => i.initiative).sort();
    expect(slugs).toEqual(["auth-core", "device-read", "misc-cleanup", "report-ui"]);
    expect(slugs).not.toContain("legacy-proto");
  });

  it("정렬 = 진행·예정 먼저 → 완료 뒤 (status rank → indexOrder)", () => {
    // active(device-read=0) → planned(report-ui, misc-cleanup=1, indexOrder 순) → shipped(auth-core=2)
    expect(items.map((i) => i.initiative)).toEqual([
      "device-read",
      "report-ui",
      "misc-cleanup",
      "auth-core",
    ]);
  });

  it("done/pending 분리 — todos 상태로 재구성, dropped 제외", () => {
    const dev = items.find((i) => i.initiative === "device-read");
    expect(dev?.done).toEqual(["d1"]);
    expect(dev?.pending).toEqual(["d2", "d3"]); // in_progress + pending, dropped(d4) 제외
  });

  it("완료 이니셔티브 = done 전부·pending 0 (archive된 done 포함)", () => {
    const auth = items.find((i) => i.initiative === "auth-core");
    expect(auth?.status).toBe("shipped");
    expect(auth?.done).toEqual(["a1", "a2"]);
    expect(auth?.pending).toEqual([]);
  });

  it("track 정규화 {key,label} + trackOrder(vocab 순 + 미분류 last)", () => {
    const auth = items.find((i) => i.initiative === "auth-core");
    expect(auth?.track).toEqual({ key: "A", label: "인증/사용자" });
    const misc = items.find((i) => i.initiative === "misc-cleanup");
    expect(misc?.track).toBeNull();
    expect(trackOrder).toEqual(["A", "B", UNGROUPED]);
  });
});
