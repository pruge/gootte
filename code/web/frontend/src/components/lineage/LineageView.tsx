import { useLineage } from "../../lib/query";
import { Loading, ErrorMsg, Empty } from "../common/states";
import { EdgeRow } from "./EdgeRow";
import { DropList } from "./DropList";

/** lineage 탭 — supersede 체인(edges, dep 제외) + drop. 전부 서버 CORE 산출 verbatim(INV-4). */
export function LineageView({ project }: { project: string }) {
  const { data, isLoading, isError, error } = useLineage(project);

  if (isLoading) return <Loading label="lineage 조립 중…" />;
  if (isError) return <ErrorMsg error={error} />;
  if (!data) return null;

  // dep(순수 의존)은 plan 관심 → 체인에서 제외. supersede/partial/reference/spawn 만.
  const chain = data.edges.filter((e) => e.kind !== "dep");

  if (chain.length === 0 && data.drops.length === 0) {
    return <Empty>supersede·drop 이력이 없습니다.</Empty>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {chain.length > 0 && (
        <section aria-labelledby="chain-heading">
          <h2 id="chain-heading" className="mono mb-2 text-xs tracking-[0.2em] text-muted">
            ── supersede 체인 ({chain.length}) ──
          </h2>
          <ul className="space-y-1">
            {chain.map((e, i) => (
              <EdgeRow key={`${e.from}-${e.to}-${i}`} edge={e} />
            ))}
          </ul>
        </section>
      )}
      <DropList drops={data.drops} />
    </div>
  );
}
