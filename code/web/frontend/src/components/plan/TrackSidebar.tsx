import type { RoadmapItem } from "@gootte/contract";
import { UNGROUPED, type TrackGrouped } from "../../lib/track";

interface TrackSidebarProps {
  groups: TrackGrouped<RoadmapItem>[];
  selected: string;
  onSelect: (key: string) => void;
  /** track key → 활성 worktree(작업중) 수 (worktreesByTrack 파생). 없으면 0. */
  worktreeCounts: Record<string, number>;
}

const doneCount = (items: RoadmapItem[]): number =>
  items.filter((i) => i.status === "shipped").length;

/** 본문 내 대분류(track) 사이드바 — 클릭 시 우측 패널이 그 track 의 진행/완료/작업중 탭을 보여줌. */
export function TrackSidebar({ groups, selected, onSelect, worktreeCounts }: TrackSidebarProps) {
  return (
    <nav
      aria-label="대분류"
      className="w-52 shrink-0 space-y-1 overflow-y-auto border-r border-border pr-3"
    >
      {groups.map((g) => {
        const done = doneCount(g.items);
        const wip = g.items.length - done;
        const wt = worktreeCounts[g.key] ?? 0;
        const on = g.key === selected;
        return (
          <button
            key={g.key}
            type="button"
            onClick={() => onSelect(g.key)}
            aria-current={on ? "true" : undefined}
            className={`flex w-full flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors ${
              on ? "border-accent/50 bg-accent/5" : "border-transparent hover:bg-fg/[0.03]"
            }`}
          >
            <span className="flex items-baseline gap-1.5">
              {g.key !== UNGROUPED && (
                <span className="mono text-sm font-semibold text-accent">{g.key}</span>
              )}
              <span
                className={`truncate text-sm font-medium tracking-tight ${on ? "text-fg" : "text-muted"}`}
              >
                {g.label}
              </span>
            </span>
            <span className="mono text-xs tabular-nums text-muted">
              진행 {wip} · 완료 {done}
              {wt > 0 && (
                <>
                  {" · "}
                  <span className="font-medium text-accent">작업중 {wt}</span>
                </>
              )}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
