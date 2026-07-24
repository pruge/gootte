import type { PlanItem, PlanRationale, GitSignal } from "@gootte/contract";
import { PRIORITY_RANK, RISK_RANK } from "../rank";
import type { ProjectState, InitiativeState } from "../state/model";

const SHIPPED = new Set(["shipped", "done"]);

export interface PlanInput {
  state: ProjectState;
  /** initiative → GitSignal (active worktree 있는 것만; core-io computeGitSignal 로 조립). */
  gitSignals?: Map<string, GitSignal>;
}

export interface PlanResult {
  plan: PlanItem[];
  rationale: PlanRationale[];
}

/**
 * T5 — 순수 projection. B2 3-분할(active/ready/blocked) 랭킹 → plan + rationale.
 * 사용자 샘플 "①②③④ + 왜" 를 규칙으로 재현.
 */
export function buildPlan(input: PlanInput): PlanResult {
  const { state } = input;
  const gitSignals = input.gitSignals ?? new Map<string, GitSignal>();

  const shipped = new Set(state.initiatives.filter((i) => SHIPPED.has(i.status)).map((i) => i.slug));
  const candidates = state.initiatives.filter(
    (i) => !SHIPPED.has(i.status) && i.status !== "superseded",
  );

  const dependedOnBy = new Map<string, number>();
  for (const i of candidates) {
    for (const d of i.deps) dependedOnBy.set(d, (dependedOnBy.get(d) ?? 0) + 1);
  }

  const unmetDeps = (i: InitiativeState): string[] => i.deps.filter((d) => !shipped.has(d));
  const isIndependent = (i: InitiativeState): boolean => (dependedOnBy.get(i.slug) ?? 0) === 0;
  const isDesignClosed = (i: InitiativeState): boolean => i.hasSpec && i.activeTodos > 0;

  /** 0=active · 1=ready-connected · 2=ready-independent-closed(자연 정지점) · 3=blocked */
  const bucket = (i: InitiativeState): number => {
    if (i.worktree) return 0;
    if (unmetDeps(i).length > 0) return 3;
    if (isDesignClosed(i) && isIndependent(i)) return 2;
    return 1;
  };

  const indexPos = (slug: string): number => {
    const p = state.indexOrder.indexOf(slug);
    return p === -1 ? Number.MAX_SAFE_INTEGER : p;
  };

  const sorted = [...candidates].sort((a, b) => {
    const ba = bucket(a);
    const bb = bucket(b);
    if (ba !== bb) return ba - bb;
    if (ba === 0) {
      const ra = RISK_RANK[gitSignals.get(a.slug)?.conflictRisk ?? "low"];
      const rb = RISK_RANK[gitSignals.get(b.slug)?.conflictRisk ?? "low"];
      if (ra !== rb) return ra - rb;
    }
    const pa = PRIORITY_RANK[a.priority];
    const pb = PRIORITY_RANK[b.priority];
    if (pa !== pb) return pa - pb;
    return indexPos(a.slug) - indexPos(b.slug);
  });

  const plan: PlanItem[] = [];
  const rationale: PlanRationale[] = [];

  sorted.forEach((i, idx) => {
    const b = bucket(i);
    const sig = gitSignals.get(i.slug);
    const pending = i.todos.filter((t) => t.status !== "done" && t.status !== "dropped");

    plan.push({
      order: idx + 1,
      initiative: i.slug,
      track: i.track ?? undefined,
      status: i.status,
      now: idx === 0 && b === 0,
      subSteps: pending.map((t) => t.slug),
      deps: i.deps,
      completeOn: i.activeTodos === 0 ? "완결" : undefined,
    });

    rationale.push({
      initiative: i.slug,
      priorityBasis:
        b === 0
          ? "활성 worktree(재개, 최우선)"
          : b === 3
            ? `blocked: ${unmetDeps(i).join(", ")} 선행`
            : b === 2
              ? "독립·설계완결(안전하게 뒤로)"
              : "의존 충족·다음 전선",
      delayCost:
        b === 0 && sig
          ? `main +${sig.mainCommitsSince} · overlap ${sig.overlapFiles.length} · conflictRisk ${sig.conflictRisk}${
              sig.conflictRisk === "high" ? " → 더 미루면 머지 험해짐" : ""
            }`
          : null,
      independence: isIndependent(i) ? "독립(막는 것 없음)" : `${dependedOnBy.get(i.slug) ?? 0}개가 의존`,
      stoppingPoint: b === 2 ? "설계완결·worktree 미착수 → 자연 정지점" : null,
    });
  });

  return { plan, rationale };
}
