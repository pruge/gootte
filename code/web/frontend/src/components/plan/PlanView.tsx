import type { PlanItem } from "@gootte/contract";
import { usePlan } from "../../lib/query";
import { groupByTrack, UNGROUPED } from "../../lib/track";
import { Loading, ErrorMsg, Empty } from "../common/states";
import { PlanItemRow } from "./PlanItemRow";
import { RationaleList } from "./RationaleList";

/** plan 탭 — 대분류(track) 섹션 헤더로 묶고, 그 안은 서버 order 그대로(INV-4 — 재정렬/판정 X). */
export function PlanView({ project }: { project: string }) {
  const { data, isLoading, isError, error } = usePlan(project);

  if (isLoading) return <Loading label="plan 계산 중…" />;
  if (isError) return <ErrorMsg error={error} />;
  if (!data) return null;
  if (data.plan.length === 0) return <Empty>실행 가능한 이니셔티브가 없습니다.</Empty>;

  const groups = groupByTrack<PlanItem>(data.plan, (i) => i.track, data.trackOrder);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-5">
        {groups.map((g) => (
          <section key={g.key} aria-label={g.label} data-track-group={g.key}>
            <header className="mono mb-2 flex items-center gap-2 border-b border-border pb-1 text-sm tracking-[0.08em] text-muted">
              {g.key !== UNGROUPED && <span className="font-semibold text-fg">{g.key}</span>}
              {g.label}
            </header>
            <ol className="space-y-2.5">
              {g.items.map((item) => (
                <PlanItemRow key={item.initiative} item={item} />
              ))}
            </ol>
          </section>
        ))}
      </div>
      <RationaleList rationale={data.rationale} />
    </div>
  );
}
