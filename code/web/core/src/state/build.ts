import type { TodoItem, LineageNode, LineageEdge } from "@gootte/contract";
import { PRIORITY_RANK, type Priority } from "../rank";
import type { StateInput, ProjectState, InitiativeState, WorktreeInput } from "./model";

const ACTIVE_TODO = new Set(["pending", "in_sprint", "in_progress"]);

function maxPriority(todos: TodoItem[]): Priority {
  let best: Priority = "low";
  for (const t of todos) if (PRIORITY_RANK[t.priority] < PRIORITY_RANK[best]) best = t.priority;
  return best;
}

/**
 * T3 — 순수 state. parsed 문서 + core-io worktree 목록 → lineage DAG + worktree↔initiative 매핑.
 * fs·git 접근 없음(INV-1/INV-2) — 입력은 이미 파싱/스캔된 데이터.
 */
export function buildState(input: StateInput): ProjectState {
  const specSet = new Set(input.specPresent);

  // worktree↔initiative: worktree.slug → sprint(slug/worktree 매칭) → todos → initiative
  const wtByInitiative = new Map<string, WorktreeInput>();
  for (const wt of input.worktrees) {
    const sprint = input.sprints.find((s) => s.slug === wt.slug || s.worktree === wt.slug);
    if (!sprint) continue;
    const todo = input.todos.find((t) => sprint.todos.includes(t.slug) && t.initiative);
    if (todo?.initiative) wtByInitiative.set(todo.initiative, wt);
  }

  const initiatives: InitiativeState[] = input.ledgers.map((l) => {
    const todos = input.todos.filter((t) => t.initiative === l.initiative);
    return {
      slug: l.initiative,
      status: l.status,
      track: l.track,
      deps: l.deps,
      priority: maxPriority(todos),
      todos,
      activeTodos: todos.filter((t) => ACTIVE_TODO.has(t.status)).length,
      hasSpec: specSet.has(l.initiative),
      worktree: wtByInitiative.get(l.initiative) ?? null,
      events: l.events,
    };
  });

  // lineage DAG
  const nodes: LineageNode[] = initiatives.map((i) => ({
    id: i.slug,
    kind: "initiative",
    status: i.status,
  }));
  const edges: LineageEdge[] = [];
  for (const i of initiatives) {
    for (const d of i.deps) edges.push({ from: i.slug, to: d, kind: "dep" });
    for (const e of i.events) {
      for (const s of e.spawns) edges.push({ from: i.slug, to: s, kind: "spawn" });
      for (const s of e.supersedes) edges.push({ from: i.slug, to: s, kind: "supersede" });
    }
  }

  return { initiatives, lineage: { nodes, edges }, indexOrder: input.indexOrder ?? [] };
}
