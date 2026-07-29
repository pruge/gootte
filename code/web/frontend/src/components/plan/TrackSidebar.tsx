import type { ReactNode } from "react";
import { UNGROUPED, type TrackGrouped } from "../../lib/track";

interface TrackSidebarProps<T> {
  groups: TrackGrouped<T>[];
  selected: string;
  onSelect: (key: string) => void;
  /** 그룹별 부제(카운트 등) — 소비처가 렌더(리스트=진행/완료/작업중, 구조=그림 수). */
  meta: (group: TrackGrouped<T>) => ReactNode;
}

/**
 * 본문 내 대분류(track) 사이드바 — 클릭 시 우측 패널이 그 track 내용을 보여줌.
 * 아이템 타입 무관(제네릭) — 리스트(이니셔티브)·구조(다이어그램) 공용. 부제는 `meta` 로 주입.
 */
export function TrackSidebar<T>({ groups, selected, onSelect, meta }: TrackSidebarProps<T>) {
  return (
    <nav
      aria-label="대분류"
      className="w-60 shrink-0 space-y-1 overflow-y-auto border-r border-border pr-3"
    >
      {groups.map((g) => {
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
            <span className="mono whitespace-nowrap text-xs tabular-nums text-muted">{meta(g)}</span>
          </button>
        );
      })}
    </nav>
  );
}
