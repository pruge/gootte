import { IconTelescope } from "@tabler/icons-react";
import type { Tab } from "../../hooks/useUrlState";
import { RoadmapView } from "../plan/RoadmapView";
import { StructureView } from "../structure/StructureView";
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
  { id: "structure", label: "구조" },
  { id: "timeline", label: "타임라인" },
];
const planMode = (view: string | null): "list" | "structure" | "timeline" =>
  view === "structure" || view === "timeline" ? view : "list";

/** 셸의 메인 영역 — 본문 header(브랜드 + 프로젝트 + 탭) + 뷰모드 토글(plan) + 뷰. */
export function MainPanel({ project, tab, view, onTab, onView }: MainPanelProps) {
  const mode = planMode(view);

  return (
    <section className="flex flex-1 flex-col overflow-hidden">
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border pl-4 pr-6">
        {project ? (
          <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">{project}</h1>
        ) : (
          <span />
        )}
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
        <div className="flex-1 overflow-hidden pl-4 pr-6 py-5">
          {tab === "lineage" ? (
            <LineageView key={`${project}-lineage`} project={project} />
          ) : mode === "structure" ? (
            <StructureView key={`${project}-structure`} project={project} />
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
