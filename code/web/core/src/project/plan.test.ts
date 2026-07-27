import { describe, it, expect } from "vitest";
import type { GitSignal } from "@gootte/contract";
import type { StateInput } from "../state/model";
import { buildState } from "../state/build";
import { buildPlan } from "./plan";

/** 사용자 샘플 형태: ① active worktree · ② ready-connected · ③ 독립+설계완결 · ④ blocked */
const input: StateInput = {
  ledgers: [
    { initiative: "calc-linear", status: "active", track: "C", deps: [], events: [], supersedes: [] },
    { initiative: "fsm-loop-ui", status: "active", track: "D", deps: [], events: [], supersedes: [] },
    { initiative: "read-generic", status: "planned", track: null, deps: [], events: [], supersedes: [] },
    {
      initiative: "protocol-read",
      status: "planned",
      track: null,
      deps: ["tuya-model"],
      events: [],
      supersedes: [],
    },
  ],
  todos: [
    { slug: "t-calc", status: "in_progress", priority: "high", initiative: "calc-linear", created: "2026-07-01" },
    { slug: "t-fsm", status: "pending", priority: "high", initiative: "fsm-loop-ui", created: "2026-07-01" },
    { slug: "t-read", status: "pending", priority: "normal", initiative: "read-generic", created: "2026-07-01" },
    { slug: "t-proto", status: "pending", priority: "normal", initiative: "protocol-read", created: "2026-07-01" },
  ],
  sprints: [{ slug: "wt-calc", status: "in_progress", todos: ["t-calc"], worktree: "wt-calc" }],
  worktrees: [{ slug: "wt-calc", branch: "worktree-wt-calc", base: "abc123" }],
  specPresent: ["calc-linear", "read-generic"], // fsm-loop-ui 는 spec 없음 → bucket 1
  indexOrder: ["calc-linear", "fsm-loop-ui", "read-generic", "protocol-read"],
};

const gitSignals = new Map<string, GitSignal>([
  [
    "calc-linear",
    {
      worktreeBase: "abc123",
      mainCommitsSince: 12,
      overlapFiles: ["FsmEngine.ts", "AuthoredFsm.ts"],
      conflictRisk: "high",
    },
  ],
]);

describe("T3 buildState — worktree 매핑 + DAG", () => {
  const state = buildState(input);

  it("worktree↔initiative 매핑 (sprint→todo→initiative)", () => {
    const calc = state.initiatives.find((i) => i.slug === "calc-linear");
    expect(calc?.worktree?.slug).toBe("wt-calc");
    const fsm = state.initiatives.find((i) => i.slug === "fsm-loop-ui");
    expect(fsm?.worktree).toBeNull();
  });

  it("worktree↔initiative 매핑 — sprint.todos(날짜없음) ↔ todo.slug(날짜접두사) 불일치 브리지", () => {
    // 실세계 cling 규약: cross-ref(sprint.todos)는 undated, 파일유래 todo.slug 는 `YYYY-MM-DD-` 접두사.
    const dated = buildState({
      ledgers: [
        { initiative: "studio-fsm", status: "active", track: null, deps: [], events: [], supersedes: [] },
      ],
      todos: [
        {
          slug: "2026-07-27-sfu-int-1-safety-contract",
          status: "in_progress",
          priority: "high",
          initiative: "studio-fsm",
          created: "2026-07-27",
        },
      ],
      sprints: [
        {
          slug: "2026-07-27-sfu-int-safety-authoring",
          status: "in_progress",
          todos: ["sfu-int-1-safety-contract"], // ← 날짜 없음
          worktree: "sfu-int-safety-authoring",
        },
      ],
      worktrees: [{ slug: "sfu-int-safety-authoring", branch: "worktree-x", base: "abc" }],
      specPresent: [],
      indexOrder: ["studio-fsm"],
    });
    expect(dated.initiatives.find((i) => i.slug === "studio-fsm")?.worktree?.slug).toBe(
      "sfu-int-safety-authoring",
    );
  });

  it("lineage DAG dep 엣지", () => {
    expect(state.lineage.edges).toContainEqual({
      from: "protocol-read",
      to: "tuya-model",
      kind: "dep",
    });
    expect(state.lineage.nodes).toHaveLength(4);
  });
});

describe("T5 buildPlan — B2 3-분할 ①②③④ 재현", () => {
  const state = buildState(input);
  const { plan, rationale } = buildPlan({ state, gitSignals });

  it("순서 = ①active ②ready ③독립-정지점 ④blocked", () => {
    expect(plan.map((p) => p.initiative)).toEqual([
      "calc-linear",
      "fsm-loop-ui",
      "read-generic",
      "protocol-read",
    ]);
  });

  it("① NOW 마커 + 방치비용(git divergence)", () => {
    expect(plan[0]?.now).toBe(true);
    expect(rationale[0]?.delayCost).toContain("conflictRisk high");
    expect(rationale[0]?.delayCost).toContain("더 미루면 머지 험해짐");
    expect(rationale[0]?.priorityBasis).toContain("재개");
  });

  it("③ 독립+설계완결 → 자연 정지점", () => {
    expect(rationale[2]?.initiative).toBe("read-generic");
    expect(rationale[2]?.stoppingPoint).toContain("자연 정지점");
    expect(plan[2]?.now).toBe(false);
  });

  it("④ blocked: 선행 의존 명시", () => {
    expect(rationale[3]?.priorityBasis).toContain("blocked");
    expect(rationale[3]?.priorityBasis).toContain("tuya-model");
  });
});
