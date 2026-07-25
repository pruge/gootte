import type { GitSignal, KanbanColumn } from "@gootte/contract";
import type { ProjectState } from "../state/model";
import { partitionInitiatives, planItemOf, type Bucket } from "./partition";

/**
 * 순수 projection — partition 을 3-파티션 칸반 컬럼으로. buildPlan 과 버킷 로직 공유(DRY).
 * active=bucket0 · ready=bucket1|2 · blocked=bucket3. 카드 = PlanItem(순서=전역 랭킹).
 */
export function buildKanban(
  state: ProjectState,
  gitSignals: Map<string, GitSignal> = new Map(),
): KanbanColumn[] {
  const ranked = partitionInitiatives(state, gitSignals);
  const cards = ranked.map((r, idx) => ({ item: planItemOf(r, idx + 1, state.tracks), bucket: r.bucket }));
  const col = (
    key: KanbanColumn["key"],
    title: string,
    keep: (b: Bucket) => boolean,
  ): KanbanColumn => ({
    key,
    title,
    items: cards.filter((c) => keep(c.bucket)).map((c) => c.item),
  });
  return [
    col("active", "ACTIVE", (b) => b === 0),
    col("ready", "READY", (b) => b === 1 || b === 2),
    col("blocked", "BLOCKED", (b) => b === 3),
  ];
}
