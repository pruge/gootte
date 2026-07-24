import { describe, it, expect } from "vitest";
import type { StateInput } from "../state/model";
import { buildState } from "../state/build";
import { buildKanban } from "./kanban";
import { buildGantt } from "./gantt";
import { buildPlan } from "./plan";

const input: StateInput = {
  ledgers: [
    {
      initiative: "alpha",
      status: "active",
      track: null,
      deps: [],
      events: [
        { initiative: "alpha", kind: "kickoff", at: "2026-07-02", trigger: null, interrupted: null, supersedes: [], spawns: [] },
      ],
      supersedes: [],
    },
    { initiative: "beta", status: "planned", track: null, deps: [], events: [], supersedes: [] },
    { initiative: "gamma", status: "planned", track: null, deps: ["missing-dep"], events: [], supersedes: [] },
  ],
  todos: [
    { slug: "t-a", status: "in_progress", priority: "high", initiative: "alpha", created: "2026-07-01" },
    { slug: "t-b", status: "pending", priority: "normal", initiative: "beta", created: "2026-07-01" },
    { slug: "t-g", status: "pending", priority: "normal", initiative: "gamma", created: "2026-07-01" },
  ],
  sprints: [
    { slug: "sp-a", status: "done", todos: ["t-a"], worktree: "wt-a", startedAt: "2026-07-03", endedAt: "2026-07-05" },
    { slug: "sp-b", status: "done", todos: ["t-b"], worktree: null, startedAt: "2026-07-06", endedAt: "2026-07-08" },
    { slug: "sp-nodate", status: "done", todos: ["t-g"], worktree: null }, // 날짜 없음 → 바 X
  ],
  worktrees: [{ slug: "wt-a", branch: "worktree-wt-a", base: "abc" }],
  specPresent: ["alpha"],
  indexOrder: ["alpha", "beta", "gamma"],
};

const state = buildState(input);

describe("buildKanban — 3 파티션", () => {
  const cols = buildKanban(state);
  const byKey = (k: string) => cols.find((c) => c.key === k)!;

  it("active=worktree · ready=충족 · blocked=미충족 dep", () => {
    expect(byKey("active").items.map((i) => i.initiative)).toEqual(["alpha"]);
    expect(byKey("ready").items.map((i) => i.initiative)).toEqual(["beta"]);
    expect(byKey("blocked").items.map((i) => i.initiative)).toEqual(["gamma"]);
  });

  it("active 카드 = NOW · 카드 형상 = PlanItem", () => {
    const alpha = byKey("active").items[0]!;
    expect(alpha.now).toBe(true);
    expect(alpha.order).toBe(1);
    expect(alpha.subSteps).toEqual(["t-a"]);
  });

  it("buildPlan 과 버킷 로직 공유 — 순서 일치(회귀)", () => {
    const { plan } = buildPlan({ state });
    expect(plan.map((p) => p.initiative)).toEqual(["alpha", "beta", "gamma"]);
  });
});

describe("buildGantt — sprint 바(날짜) + kickoff 마커", () => {
  const g = buildGantt(state);

  it("바 = 날짜 있는 sprint 만(sp-nodate 제외)", () => {
    const alpha = g.rows.find((r) => r.initiative === "alpha")!;
    expect(alpha.bars).toEqual([{ kind: "sprint", label: "sp-a", start: "2026-07-03", end: "2026-07-05" }]);
    // gamma = 바 없음(sp-nodate 날짜 X) + 마커 없음 → 행 자체 없음
    expect(g.rows.find((r) => r.initiative === "gamma")).toBeUndefined();
  });

  it("kickoff 이벤트 → 마커", () => {
    const alpha = g.rows.find((r) => r.initiative === "alpha")!;
    expect(alpha.markers).toEqual([{ at: "2026-07-02", kind: "kickoff", label: "alpha" }]);
  });

  it("날짜 bounds = 전체 min/max", () => {
    expect(g.from).toBe("2026-07-02"); // alpha 마커
    expect(g.to).toBe("2026-07-08"); // beta 바 종료
  });

  it("행 정렬 = 이른 날짜 순(alpha→beta)", () => {
    expect(g.rows.map((r) => r.initiative)).toEqual(["alpha", "beta"]);
  });
});
