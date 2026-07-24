import { IconTelescope } from "@tabler/icons-react";
import type { Tab } from "../../hooks/useUrlState";
import { PlanView } from "../plan/PlanView";
import { LineageView } from "../lineage/LineageView";
import { Tabs } from "./Tabs";

interface MainPanelProps {
  project: string | null;
  tab: Tab;
  onTab: (t: Tab) => void;
}

/** 셸의 메인 영역 — 헤더(프로젝트+탭) + plan/lineage 뷰(010). */
export function MainPanel({ project, tab, onTab }: MainPanelProps) {
  if (!project) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center gap-3 text-muted">
        <IconTelescope size={40} stroke={1.25} />
        <p className="text-sm">왼쪽에서 프로젝트를 선택하세요.</p>
      </section>
    );
  }

  return (
    <section className="flex flex-1 flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <h1 className="text-hero font-semibold tracking-tight">{project}</h1>
        <Tabs tab={tab} onTab={onTab} />
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {tab === "plan" ? (
          <PlanView key={`${project}-plan`} project={project} />
        ) : (
          <LineageView key={`${project}-lineage`} project={project} />
        )}
      </div>
    </section>
  );
}
