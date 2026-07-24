import { usePlan } from "../../lib/query";
import { Loading, ErrorMsg, Empty } from "../common/states";
import { PlanItemRow } from "./PlanItemRow";
import { RationaleList } from "./RationaleList";

/** plan 탭 — 순서(서버 order) + 왜. 프론트는 재정렬/판정 X, 서버 배열 그대로 렌더(INV-4). */
export function PlanView({ project }: { project: string }) {
  const { data, isLoading, isError, error } = usePlan(project);

  if (isLoading) return <Loading label="plan 계산 중…" />;
  if (isError) return <ErrorMsg error={error} />;
  if (!data) return null;
  if (data.plan.length === 0) return <Empty>실행 가능한 이니셔티브가 없습니다.</Empty>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <ol className="space-y-2.5">
        {data.plan.map((item) => (
          <PlanItemRow key={item.initiative} item={item} />
        ))}
      </ol>
      <RationaleList rationale={data.rationale} />
    </div>
  );
}
