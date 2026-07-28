import { useMemo, useState } from "react";
import { IconChartDots3 } from "@tabler/icons-react";
import { useStructure } from "../../lib/query";
import { Loading, ErrorMsg } from "../common/states";
import { StructureIndex } from "./StructureIndex";
import { DiagramFocus } from "./DiagramFocus";

/**
 * plan "구조" 뷰 — 관리대상 프로젝트 저작 docs/mermaid 다이어그램을 track 별로(리스트와 동축).
 * 좌 인덱스 → 클릭 → 우 포커스 렌더(MermaidBlock). 서버 그룹 순서 verbatim(INV-4)·read-only(INV-2).
 */
export function StructureView({ project }: { project: string }) {
  const { data, isLoading, isError, error } = useStructure(project);
  const [selected, setSelected] = useState<string | null>(null);

  const allIds = useMemo(
    () => data?.groups.flatMap((g) => g.diagrams.map((d) => d.id)) ?? [],
    [data],
  );

  if (isLoading) return <Loading label="구조 다이어그램 로드 중…" />;
  if (isError) return <ErrorMsg error={error} />;
  if (!data) return null;

  if (allIds.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted">
        <IconChartDots3 size={40} stroke={1.25} />
        <p className="text-sm">이 프로젝트엔 저작된 구조 다이어그램이 없습니다.</p>
        <p className="mono text-xs opacity-70">docs/mermaid/ 에 M-NNNN 을 저작하면 여기 나타납니다.</p>
      </div>
    );
  }

  // 선택 없거나 그림이 사라졌으면(라이브 갱신) 첫 그림으로.
  const activeId = selected && allIds.includes(selected) ? selected : allIds[0]!;
  const active = data.groups.flatMap((g) => g.diagrams).find((d) => d.id === activeId)!;

  return (
    <div className="flex h-full gap-5">
      <StructureIndex groups={data.groups} selectedId={activeId} onSelect={setSelected} />
      <DiagramFocus key={active.id} diagram={active} />
    </div>
  );
}
