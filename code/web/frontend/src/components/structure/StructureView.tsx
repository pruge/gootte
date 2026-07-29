import { useMemo, useState } from "react";
import { IconChartDots3 } from "@tabler/icons-react";
import type { StructureDiagram } from "@gootte/contract";
import { useStructure } from "../../lib/query";
import { UNGROUPED, type TrackGrouped } from "../../lib/track";
import { Loading, ErrorMsg } from "../common/states";
import { TrackSidebar } from "../plan/TrackSidebar";
import { StructureList } from "./StructureList";
import { DiagramDrawer } from "./DiagramDrawer";

/**
 * plan "구조" 뷰 — 리스트 뷰와 동형: 좌측 공유 track 사이드바 + 본문 다이어그램 목록.
 * 목록 항목 클릭 → 목록을 덮는 넓은 드로어에 mermaid 렌더(ESC·백드롭·X 닫음). read-only(INV-2)·서버 순서 verbatim(INV-4).
 */
export function StructureView({ project }: { project: string }) {
  const { data, isLoading, isError, error } = useStructure(project);
  const [track, setTrack] = useState<string | null>(null);
  const [open, setOpen] = useState<StructureDiagram | null>(null);

  // 서버 그룹(순서 verbatim) → track 사이드바용 TrackGrouped. null track = 시스템/공통(UNGROUPED sentinel).
  const groups = useMemo<TrackGrouped<StructureDiagram>[]>(
    () =>
      data?.groups.map((g) => ({
        key: g.track?.key ?? UNGROUPED,
        label: g.track?.label ?? "시스템 / 공통",
        items: g.diagrams,
      })) ?? [],
    [data],
  );

  if (isLoading) return <Loading label="구조 다이어그램 로드 중…" />;
  if (isError) return <ErrorMsg error={error} />;
  if (!data) return null;

  if (groups.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted">
        <IconChartDots3 size={40} stroke={1.25} />
        <p className="text-sm">이 프로젝트엔 저작된 구조 다이어그램이 없습니다.</p>
        <p className="mono text-xs opacity-70">docs/mermaid/ 에 M-NNNN 을 저작하면 여기 나타납니다.</p>
      </div>
    );
  }

  const active = groups.find((g) => g.key === track) ?? groups[0]!;

  return (
    <div className="relative flex h-full gap-5">
      <TrackSidebar
        groups={groups}
        selected={active.key}
        onSelect={setTrack}
        meta={(g) => <>그림 {g.items.length}</>}
      />
      <div className="relative min-w-0 flex-1">
        <StructureList group={active} onOpen={setOpen} />
        {open && <DiagramDrawer diagram={open} onClose={() => setOpen(null)} />}
      </div>
    </div>
  );
}
