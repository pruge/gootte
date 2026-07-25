import { describe, it, expect } from "vitest";
import type { StateInput } from "../state/model";
import { buildState } from "../state/build";
import { computeTrackOrder, presentTrackOrder, UNGROUPED } from "./track";
import { buildGantt } from "./gantt";
import { buildPlan } from "./plan";

// C(선두)·F(중간)·미분류(delta) + vocab 밖 key(Z) — 순서 결정성 검증용.
const mkInput = (tracks?: Map<string, string>): StateInput => ({
  ledgers: [
    { initiative: "alpha", status: "active", track: "C — 제어 알고리즘", deps: [], events: [], supersedes: [] },
    { initiative: "beta", status: "planned", track: "F — 실시간", deps: [], events: [], supersedes: [] },
    { initiative: "gamma", status: "planned", track: "Z — 실험", deps: [], events: [], supersedes: [] },
    { initiative: "delta", status: "planned", track: null, deps: [], events: [], supersedes: [] },
  ],
  todos: [
    { slug: "t-a", status: "in_progress", priority: "high", initiative: "alpha", created: "2026-07-01" },
    { slug: "t-b", status: "pending", priority: "normal", initiative: "beta", created: "2026-07-01" },
    { slug: "t-g", status: "pending", priority: "normal", initiative: "gamma", created: "2026-07-01" },
    { slug: "t-d", status: "pending", priority: "normal", initiative: "delta", created: "2026-07-01" },
  ],
  sprints: [
    { slug: "sp-a", status: "done", todos: ["t-a"], worktree: null, startedAt: "2026-07-03", endedAt: "2026-07-05" },
    { slug: "sp-b", status: "done", todos: ["t-b"], worktree: null, startedAt: "2026-07-06", endedAt: "2026-07-08" },
    { slug: "sp-d", status: "done", todos: ["t-d"], worktree: null, startedAt: "2026-07-09", endedAt: "2026-07-11" },
  ],
  worktrees: [],
  specPresent: [],
  indexOrder: ["alpha", "beta", "gamma", "delta"],
  tracks,
});

const VOCAB = new Map([
  ["F", "실시간 / 게이트웨이"],
  ["C", "제어 알고리즘"],
]); // 선언 순 F→C (indexOrder 와 다름 — vocab 순 우선 검증)

describe("computeTrackOrder — 결정적 그룹 순서", () => {
  it("vocab 선언 순 우선 + vocab 밖 key = indexOrder 최초등장 순", () => {
    const state = buildState(mkInput(VOCAB));
    // vocab: F, C → 그 뒤 vocab밖 Z(gamma, indexOrder 2). 미분류는 여기 미포함(present 필터가 붙임).
    expect(computeTrackOrder(state)).toEqual(["F", "C", "Z"]);
  });

  it("vocab 없으면 전부 indexOrder 최초등장 순", () => {
    const state = buildState(mkInput());
    expect(computeTrackOrder(state)).toEqual(["C", "F", "Z"]); // alpha=C, beta=F, gamma=Z
  });

  it("presentTrackOrder = present 필터 + 미분류 last", () => {
    const state = buildState(mkInput(VOCAB));
    expect(presentTrackOrder(state, ["C"], true)).toEqual(["C", UNGROUPED]);
    expect(presentTrackOrder(state, ["Z", "F"], false)).toEqual(["F", "Z"]); // computeTrackOrder 순 유지
  });
});

describe("buildGantt — 정규화 track 부착 + trackOrder", () => {
  it("행마다 정규화 track(vocab label), trackOrder 미분류 last", () => {
    const g = buildGantt(buildState(mkInput(VOCAB)));
    const byInit = Object.fromEntries(g.rows.map((r) => [r.initiative, r.track]));
    expect(byInit.alpha).toEqual({ key: "C", label: "제어 알고리즘" }); // vocab canonical
    expect(byInit.beta).toEqual({ key: "F", label: "실시간 / 게이트웨이" });
    expect(byInit.delta).toBeNull(); // 미분류
    // 바 있는 것 = alpha(C)·beta(F)·delta(미분류). gamma 는 날짜 sprint 없어 행 X.
    expect(g.trackOrder).toEqual(["F", "C", UNGROUPED]);
  });

  it("vocab 없으면 프로즈 파생 label", () => {
    const g = buildGantt(buildState(mkInput()));
    const alpha = g.rows.find((r) => r.initiative === "alpha")?.track;
    expect(alpha).toEqual({ key: "C", label: "제어 알고리즘" });
  });
});

describe("buildPlan — trackOrder(전 이니셔티브 present)", () => {
  it("plan trackOrder = present + 미분류 last", () => {
    const { trackOrder } = buildPlan({ state: buildState(mkInput(VOCAB)) });
    // 모든 이니셔티브 등장: F,C,Z present + delta 미분류.
    expect(trackOrder).toEqual(["F", "C", "Z", UNGROUPED]);
  });
});
