import { describe, it, expect } from "vitest";
import type { StateInput } from "./model";
import { buildState } from "./build";

/**
 * 033 회귀 — 활성 worktree 카운트 단일 소스.
 * 같은 이니셔티브에 묶인 2 worktree(병렬 T2/T3)가 하나로 collapse 되던 버그
 * (사이드바 2 · 본문 1) 방지. state.worktrees = 스캔 1:1 바인딩.
 */
describe("buildState — worktree 바인딩 단일 소스 (033)", () => {
  const base: Omit<StateInput, "sprints" | "worktrees" | "todos"> = {
    ledgers: [
      { initiative: "send-command-unification", status: "active", track: "F", deps: [], events: [], supersedes: [] },
    ],
    specPresent: [],
    indexOrder: ["send-command-unification"],
  };

  it("같은 이니셔티브의 2 worktree 가 둘 다 바인딩에 남는다 (collapse X)", () => {
    const input: StateInput = {
      ...base,
      todos: [
        { slug: "send-gateway-engine", status: "in_progress", priority: "high", initiative: "send-command-unification", created: "2026-07-29" },
        { slug: "send-authoring-materialize", status: "in_progress", priority: "high", initiative: "send-command-unification", created: "2026-07-29" },
      ],
      sprints: [
        { slug: "send-gateway-engine", status: "in_progress", todos: ["send-gateway-engine"], worktree: "send-gateway-engine" },
        { slug: "send-authoring-materialize", status: "in_progress", todos: ["send-authoring-materialize"], worktree: "send-authoring-materialize" },
      ],
      worktrees: [
        { slug: "send-gateway-engine", branch: "worktree-send-gateway-engine", base: "aaa" },
        { slug: "send-authoring-materialize", branch: "worktree-send-authoring-materialize", base: "bbb" },
      ],
    };

    const state = buildState(input);

    // 스캔 1:1 — 두 worktree 모두 존재(과거엔 initiative-키 map 이 하나를 덮어씀).
    expect(state.worktrees).toHaveLength(2);
    expect(state.worktrees.map((b) => b.worktree.slug).sort()).toEqual([
      "send-authoring-materialize",
      "send-gateway-engine",
    ]);
    // 둘 다 같은 이니셔티브로 해소.
    expect(state.worktrees.every((b) => b.initiative === "send-command-unification")).toBe(true);
    // sprint 도 각자 매칭.
    expect(state.worktrees.find((b) => b.worktree.slug === "send-authoring-materialize")?.sprint).toBe(
      "send-authoring-materialize",
    );
  });

  it("length = scanned worktrees length (사이드바 배지 == 본문 항등)", () => {
    const worktrees = [
      { slug: "wt-a", branch: "worktree-wt-a", base: "a" },
      { slug: "wt-b", branch: "worktree-wt-b", base: "b" },
      { slug: "wt-orphan", branch: "worktree-wt-orphan", base: "c" },
    ];
    const input: StateInput = {
      ...base,
      todos: [
        { slug: "t-a", status: "in_progress", priority: "high", initiative: "send-command-unification", created: "2026-07-29" },
      ],
      sprints: [{ slug: "wt-a", status: "in_progress", todos: ["t-a"], worktree: "wt-a" }],
      worktrees,
    };

    const state = buildState(input);
    expect(state.worktrees).toHaveLength(worktrees.length);
  });

  it("미바인딩 worktree(매칭 sprint 없음)도 목록에 남되 initiative/sprint = null", () => {
    const input: StateInput = {
      ...base,
      todos: [],
      sprints: [], // 매칭 sprint 없음
      worktrees: [{ slug: "wt-orphan", branch: "worktree-wt-orphan", base: "z" }],
    };

    const state = buildState(input);
    expect(state.worktrees).toHaveLength(1);
    expect(state.worktrees[0]?.initiative).toBeNull();
    expect(state.worktrees[0]?.sprint).toBeNull();
  });

  it("InitiativeState.worktree(단수)는 first-wins 로 여전히 세팅 (plan/partition 불리언 보존)", () => {
    const input: StateInput = {
      ...base,
      todos: [
        { slug: "send-gateway-engine", status: "in_progress", priority: "high", initiative: "send-command-unification", created: "2026-07-29" },
        { slug: "send-authoring-materialize", status: "in_progress", priority: "high", initiative: "send-command-unification", created: "2026-07-29" },
      ],
      sprints: [
        { slug: "send-gateway-engine", status: "in_progress", todos: ["send-gateway-engine"], worktree: "send-gateway-engine" },
        { slug: "send-authoring-materialize", status: "in_progress", todos: ["send-authoring-materialize"], worktree: "send-authoring-materialize" },
      ],
      worktrees: [
        { slug: "send-gateway-engine", branch: "worktree-send-gateway-engine", base: "aaa" },
        { slug: "send-authoring-materialize", branch: "worktree-send-authoring-materialize", base: "bbb" },
      ],
    };

    const state = buildState(input);
    const init = state.initiatives.find((i) => i.slug === "send-command-unification");
    expect(init?.worktree?.slug).toBe("send-gateway-engine"); // 첫 바인딩
  });
});
