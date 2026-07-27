import { useState } from "react";
import type { RoadmapItem, WorktreeStatus } from "@gootte/contract";
import type { TrackGrouped } from "../../lib/track";
import { RoadmapItemRow } from "./RoadmapItemRow";
import { WorktreeCard } from "../worktree/WorktreeCard";

type TabKey = "wip" | "done" | "wt";

const isDone = (i: RoadmapItem): boolean => i.status === "shipped";

interface RoadmapPanelProps {
  group: TrackGrouped<RoadmapItem>;
  /** 현재 작업중(활성) worktree — 전역(track 무관). "작업중" 탭이 보여줌. */
  worktrees: WorktreeStatus[];
  onOpenDoc: (name: string) => void;
  onOpenSprint: (sprint: string, worktree: string) => void;
}

/**
 * 선택된 대분류 패널 — 진행 / 완료 / 작업중 세 탭.
 * 진행·완료 = 그 track 이니셔티브(+할일 체크리스트). 작업중 = 활성 worktree 카드(→ sprint 문서).
 * 탭 본문은 flex-1 + overflow-y-auto → 최대 높이 = 화면 높이(넘치면 자체 스크롤).
 */
export function RoadmapPanel({ group, worktrees, onOpenDoc, onOpenSprint }: RoadmapPanelProps) {
  const done = group.items.filter(isDone);
  const wip = group.items.filter((i) => !isDone(i));
  const [tab, setTab] = useState<TabKey>(wip.length === 0 && done.length > 0 ? "done" : "wip");

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "wip", label: "진행", count: wip.length },
    { key: "done", label: "완료", count: done.length },
    { key: "wt", label: "작업중", count: worktrees.length },
  ];
  const items = tab === "done" ? done : wip;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div role="tablist" aria-label="상태" className="flex gap-1 border-b border-border">
        {tabs.map((t) => {
          const on = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.key)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                on ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"
              }`}
            >
              {t.label}
              <span className="mono text-xs tabular-nums text-muted">{t.count}</span>
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pt-3">
        {tab === "wt" ? (
          worktrees.length === 0 ? (
            <p className="text-base text-muted">진행 중인 worktree 가 없습니다.</p>
          ) : (
            <ol className="max-w-3xl space-y-3">
              {worktrees.map((wt) => (
                <WorktreeCard key={wt.slug} wt={wt} onOpen={onOpenSprint} />
              ))}
            </ol>
          )
        ) : items.length === 0 ? (
          <p className="text-base text-muted">
            {tab === "done" ? "완료된 항목이 없습니다." : "진행 중인 항목이 없습니다."}
          </p>
        ) : (
          <ol className="max-w-3xl space-y-2.5 pr-1">
            {items.map((item) => (
              <RoadmapItemRow key={item.initiative} item={item} onOpenDoc={onOpenDoc} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
