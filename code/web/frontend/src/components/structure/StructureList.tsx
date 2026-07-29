import { IconChartDots3 } from "@tabler/icons-react";
import type { StructureDiagram } from "@gootte/contract";
import type { TrackGrouped } from "../../lib/track";

interface StructureListProps {
  group: TrackGrouped<StructureDiagram>;
  onOpen: (diagram: StructureDiagram) => void;
}

/** 선택된 track 의 다이어그램 목록 — 클릭 시 뷰어(DiagramDrawer) 오픈. 리스트 뷰 본문과 동형. */
export function StructureList({ group, onOpen }: StructureListProps) {
  if (group.items.length === 0) {
    return <p className="px-1 pt-2 text-sm text-muted opacity-70">이 대분류엔 다이어그램이 없습니다.</p>;
  }
  return (
    <ul className="space-y-1.5 overflow-y-auto pr-1">
      {group.items.map((d) => {
        const superseded = d.status === "superseded";
        return (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => onOpen(d)}
              className={`flex w-full items-center gap-2.5 rounded-lg border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-accent/40 hover:bg-accent/[0.04] ${
                superseded ? "opacity-60" : ""
              }`}
            >
              <IconChartDots3 size={18} className="shrink-0 text-accent" />
              <span className="mono shrink-0 text-sm text-muted">{d.id}</span>
              <span className="min-w-0 flex-1 truncate font-medium tracking-tight">{d.title}</span>
              <span
                className={`mono shrink-0 rounded px-1.5 py-0.5 text-xs ${
                  superseded ? "bg-surface-2 text-muted" : "bg-accent/10 text-accent"
                }`}
              >
                {superseded ? "⚫ superseded" : "🟢 living"}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
