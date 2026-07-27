import { useState } from "react";
import type { RoadmapItem } from "@gootte/contract";
import type { TrackGrouped } from "../../lib/track";
import { RoadmapItemRow } from "./RoadmapItemRow";

type TabKey = "wip" | "done";

const isDone = (i: RoadmapItem): boolean => i.status === "shipped";

/**
 * 선택된 대분류의 우측 패널 — 진행/완료 두 탭으로 이니셔티브 구분.
 * 탭 본문은 flex-1 + overflow-y-auto → 최대 높이 = 화면 높이(넘치면 자체 스크롤).
 */
interface RoadmapPanelProps {
  group: TrackGrouped<RoadmapItem>;
  onOpenDoc: (name: string) => void;
}

export function RoadmapPanel({ group, onOpenDoc }: RoadmapPanelProps) {
  const done = group.items.filter(isDone);
  const wip = group.items.filter((i) => !isDone(i));
  const [tab, setTab] = useState<TabKey>(wip.length === 0 && done.length > 0 ? "done" : "wip");

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "wip", label: "진행", count: wip.length },
    { key: "done", label: "완료", count: done.length },
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
        {items.length === 0 ? (
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
