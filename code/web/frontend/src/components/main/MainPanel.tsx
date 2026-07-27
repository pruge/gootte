import { IconTelescope, IconTopologyStar3 } from "@tabler/icons-react";
import type { Tab } from "../../hooks/useUrlState";
import { RoadmapView } from "../plan/RoadmapView";
import { BoardView } from "../board/BoardView";
import { TimelineView } from "../timeline/TimelineView";
import { LineageView } from "../lineage/LineageView";
import { Tabs } from "./Tabs";
import { ViewMode, type ViewModeOption } from "./ViewMode";

interface MainPanelProps {
  project: string | null;
  tab: Tab;
  view: string | null;
  onTab: (t: Tab) => void;
  onView: (v: string) => void;
}

const PLAN_MODES: ViewModeOption[] = [
  { id: "list", label: "리스트" },
  { id: "board", label: "보드" },
  { id: "timeline", label: "타임라인" },
];
const planMode = (view: string | null): "list" | "board" | "timeline" =>
  view === "board" || view === "timeline" ? view : "list";

/** 셸의 메인 영역 — 본문 header(브랜드 + 프로젝트 + 탭) + 뷰모드 토글(plan) + 뷰. */
export function MainPanel({ project, tab, view, onTab, onView }: MainPanelProps) {
  const mode = planMode(view);

  return (
    <section className="flex flex-1 flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex shrink-0 items-center gap-2" title="gootte — 프로젝트 관리">
            <IconTopologyStar3 size={20} className="text-accent" stroke={1.75} />
            <span className="text-base font-semibold tracking-tight">gootte</span>
          </span>
          {project && (
            <>
              <span className="text-muted/40" aria-hidden>
                /
              </span>
              <h1 className="truncate text-hero font-semibold tracking-tight">{project}</h1>
            </>
          )}
        </div>
        {project && (
          <div className="flex shrink-0 items-center gap-3">
            {tab === "plan" && <ViewMode options={PLAN_MODES} value={mode} onChange={onView} />}
            <Tabs tab={tab} onTab={onTab} />
          </div>
        )}
      </header>

      {!project ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted">
          <IconTelescope size={40} stroke={1.25} />
          <p className="text-sm">왼쪽에서 프로젝트를 선택하세요.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden px-6 py-5">
          {tab === "lineage" ? (
            <LineageView key={`${project}-lineage`} project={project} />
          ) : mode === "board" ? (
            <BoardView key={`${project}-board`} project={project} />
          ) : mode === "timeline" ? (
            <TimelineView key={`${project}-timeline`} project={project} />
          ) : (
            <div className="h-full overflow-hidden">
              <RoadmapView key={`${project}-plan`} project={project} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
