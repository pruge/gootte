import type { GitSignal, PlanItem } from "@gootte/contract";
import { PRIORITY_RANK, RISK_RANK } from "../rank";
import type { ProjectState, InitiativeState } from "../state/model";

const SHIPPED = new Set(["shipped", "done"]);

/** 0=active · 1=ready-connected · 2=ready-independent-closed(자연 정지점) · 3=blocked */
export type Bucket = 0 | 1 | 2 | 3;

export interface Ranked {
  init: InitiativeState;
  bucket: Bucket;
  unmetDeps: string[];
  dependedOnBy: number;
  independent: boolean;
}

/**
 * buildPlan·buildKanban 공유 — actionable 이니셔티브를 버킷 분류 후 정렬(B2 랭킹).
 * INV-4: 순수·결정적. 순서 tiebreak = conflictRisk(active) → priority → indexOrder.
 */
export function partitionInitiatives(
  state: ProjectState,
  gitSignals: Map<string, GitSignal> = new Map(),
): Ranked[] {
  const shipped = new Set(
    state.initiatives.filter((i) => SHIPPED.has(i.status)).map((i) => i.slug),
  );
  // actionable 만 = 할일 남았거나(활성 todo>0) 진행 중(worktree). 0-todo "완결" 제외.
  const candidates = state.initiatives.filter(
    (i) =>
      !SHIPPED.has(i.status) &&
      i.status !== "superseded" &&
      (i.activeTodos > 0 || i.worktree !== null),
  );

  const dependedOnBy = new Map<string, number>();
  for (const i of candidates) {
    for (const d of i.deps) dependedOnBy.set(d, (dependedOnBy.get(d) ?? 0) + 1);
  }

  const unmet = (i: InitiativeState): string[] => i.deps.filter((d) => !shipped.has(d));
  const independentOf = (i: InitiativeState): boolean => (dependedOnBy.get(i.slug) ?? 0) === 0;
  const designClosed = (i: InitiativeState): boolean => i.hasSpec && i.activeTodos > 0;
  const bucketOf = (i: InitiativeState): Bucket => {
    if (i.worktree) return 0;
    if (unmet(i).length > 0) return 3;
    if (designClosed(i) && independentOf(i)) return 2;
    return 1;
  };
  const indexPos = (slug: string): number => {
    const p = state.indexOrder.indexOf(slug);
    return p === -1 ? Number.MAX_SAFE_INTEGER : p;
  };

  return candidates
    .map<Ranked>((init) => ({
      init,
      bucket: bucketOf(init),
      unmetDeps: unmet(init),
      dependedOnBy: dependedOnBy.get(init.slug) ?? 0,
      independent: independentOf(init),
    }))
    .sort((a, b) => {
      if (a.bucket !== b.bucket) return a.bucket - b.bucket;
      if (a.bucket === 0) {
        const ra = RISK_RANK[gitSignals.get(a.init.slug)?.conflictRisk ?? "low"];
        const rb = RISK_RANK[gitSignals.get(b.init.slug)?.conflictRisk ?? "low"];
        if (ra !== rb) return ra - rb;
      }
      const pa = PRIORITY_RANK[a.init.priority];
      const pb = PRIORITY_RANK[b.init.priority];
      if (pa !== pb) return pa - pb;
      return indexPos(a.init.slug) - indexPos(b.init.slug);
    });
}

/** Ranked → PlanItem. now = 전역 1위 && active(idx0&&bucket0와 동치). plan·kanban 공유(카드 형상 일관). */
export function planItemOf(r: Ranked, order: number): PlanItem {
  const pending = r.init.todos.filter((t) => t.status !== "done" && t.status !== "dropped");
  return {
    order,
    initiative: r.init.slug,
    track: r.init.track ?? undefined,
    status: r.init.status,
    now: order === 1 && r.bucket === 0,
    subSteps: pending.map((t) => t.slug),
    deps: r.init.deps,
    completeOn: r.init.activeTodos === 0 ? "완결" : undefined,
  };
}
