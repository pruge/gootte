import type { TodoItem, LineageNode, LineageEdge } from "@gootte/contract";
import { PRIORITY_RANK, type Priority } from "../rank";
import type { StateInput, ProjectState, InitiativeState, WorktreeInput } from "./model";
import { buildLineage } from "./lineage";

const ACTIVE_TODO = new Set(["pending", "in_sprint", "in_progress"]);

/**
 * slug 날짜접두사 정규화 — cling 규약상 cross-ref(sprint.todos·todo `sprint:`)는 undated 이나
 * 파일유래 slug 는 `YYYY-MM-DD-` 접두사를 가짐. 매칭 전 양쪽을 벗겨 identity↔reference 를 브리지.
 */
const undate = (slug: string): string => slug.replace(/^\d{4}-\d{2}-\d{2}-/, "");

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

  // 이니셔티브 slug 집합 — todo `initiative:` 가 null 일 때 `related` 경로로 연결 추론(blueprint 스타일).
  // ledger/blueprint 어느 쪽에서 온 이니셔티브든 여기 포함(load 가 채움).
  const initSlugs = new Set(input.ledgers.map((l) => l.initiative));
  const effInitiative = (t: TodoItem): string | null => {
    if (t.initiative) return t.initiative;
    for (const r of t.related ?? []) {
      for (const seg of r.split(/[/\\]/)) if (initSlugs.has(seg)) return seg;
    }
    return null;
  };

  // worktree↔initiative: worktree.slug → sprint(slug/worktree 매칭) → todos → initiative(effInitiative — related 포함)
  const wtByInitiative = new Map<string, WorktreeInput>();
  for (const wt of input.worktrees) {
    // sprint.worktree 필드가 바인딩됐으면 그걸로, 아니면 slug 로 fallback.
    // slug 매칭도 undate — sprint.slug 는 `YYYY-MM-DD-` 접두사, wt.slug(디렉토리명)는 undated →
    // `worktree:` 미바인딩(pre-entry 커밋 누락) 이어도 slug 로 복구.
    const sprint = input.sprints.find(
      (s) => s.worktree === wt.slug || undate(s.slug) === undate(wt.slug),
    );
    if (!sprint) continue;
    const sprintTodos = new Set(sprint.todos.map(undate));
    for (const t of input.todos) {
      if (!sprintTodos.has(undate(t.slug))) continue;
      const init = effInitiative(t);
      if (init) {
        wtByInitiative.set(init, wt);
        break;
      }
    }
  }

  const initiatives: InitiativeState[] = input.ledgers.map((l) => {
    const todos = input.todos.filter((t) => effInitiative(t) === l.initiative);
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

  // supersede/drop 채움 (W3 — lineage.ts)
  const fill = buildLineage({
    supersessions: input.supersessions ?? [],
    adrs: input.adrs ?? [],
    todos: input.todos,
  });
  nodes.push(...fill.nodes);
  edges.push(...fill.edges);

  return {
    initiatives,
    lineage: { nodes, edges },
    indexOrder: input.indexOrder ?? [],
    drops: fill.drops,
    supersessions: input.supersessions ?? [],
    sprints: input.sprints,
    tracks: input.tracks ?? new Map(),
  };
}
