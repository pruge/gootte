import type { PlanItem, PlanRationale, GitSignal } from "@gootte/contract";
import type { ProjectState } from "../state/model";
import { partitionInitiatives, planItemOf, type Ranked } from "./partition";
import { normalizeTrack } from "../parse/track";
import { presentTrackOrder } from "./track";

export interface PlanInput {
  state: ProjectState;
  /** initiative → GitSignal (active worktree 있는 것만; core-io computeGitSignal 로 조립). */
  gitSignals?: Map<string, GitSignal>;
}

export interface PlanResult {
  plan: PlanItem[];
  rationale: PlanRationale[];
  /** 대분류 그룹 순서(등장 track + 미분류 last) — 리스트 그룹 렌더(021). 결정적. */
  trackOrder: string[];
}

function rationaleOf(r: Ranked, gitSignals: Map<string, GitSignal>): PlanRationale {
  const sig = gitSignals.get(r.init.slug);
  return {
    initiative: r.init.slug,
    priorityBasis:
      r.bucket === 0
        ? "활성 worktree(재개, 최우선)"
        : r.bucket === 3
          ? `blocked: ${r.unmetDeps.join(", ")} 선행`
          : r.bucket === 2
            ? "독립·설계완결(안전하게 뒤로)"
            : "의존 충족·다음 전선",
    delayCost:
      r.bucket === 0 && sig
        ? `main +${sig.mainCommitsSince} · overlap ${sig.overlapFiles.length} · conflictRisk ${sig.conflictRisk}${
            sig.conflictRisk === "high" ? " → 더 미루면 머지 험해짐" : ""
          }`
        : null,
    independence: r.independent ? "독립(막는 것 없음)" : `${r.dependedOnBy}개가 의존`,
    stoppingPoint: r.bucket === 2 ? "설계완결·worktree 미착수 → 자연 정지점" : null,
  };
}

/**
 * 순수 projection — partitionInitiatives(공유) → plan + rationale.
 * 사용자 샘플 "①②③④ + 왜" 를 규칙으로 재현. (버킷·정렬은 partition 이 소유 — DRY.)
 */
export function buildPlan(input: PlanInput): PlanResult {
  const gitSignals = input.gitSignals ?? new Map<string, GitSignal>();
  const ranked = partitionInitiatives(input.state, gitSignals);

  const presentKeys: string[] = [];
  let anyUngrouped = false;
  for (const r of ranked) {
    const t = normalizeTrack(r.init.track, input.state.tracks);
    if (t) presentKeys.push(t.key);
    else anyUngrouped = true;
  }

  return {
    plan: ranked.map((r, idx) => planItemOf(r, idx + 1)),
    rationale: ranked.map((r) => rationaleOf(r, gitSignals)),
    trackOrder: presentTrackOrder(input.state, presentKeys, anyUngrouped),
  };
}
