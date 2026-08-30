import { useEffect, useState } from "react";
import { IconSettings, IconTelescope } from "@tabler/icons-react";
import type { Tab } from "../../hooks/useUrlState";
import { FeaturesView } from "../features/FeaturesView";
import { PlanView } from "../plan/PlanView";
import { ProcessView } from "../process/ProcessView";
import { SettingsView } from "../settings/SettingsView";
import { Tabs } from "./Tabs";

interface MainPanelProps {
  project: string | null;
  tab: Tab;
  onTab: (t: Tab) => void;
  view: string | null;
  onView: (v: string | null) => void;
}

export function MainPanel({
  project,
  tab,
  onTab,
  view,
  onView,
}: MainPanelProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const headerTitle = settingsOpen ? "Settings" : project;

  // 좌측 사이드바에서 프로젝트를 클릭하면 설정을 닫고 그 프로젝트 뷰를 보여준다 —
  // 설정이 전역이라 프로젝트 전환과 무관하게 열려 있지만, 진입 후 나가는 가장 자연스러운
  // 길은 "다른 프로젝트를 고르는 것"이다(캡틴 지시).
  useEffect(() => {
    setSettingsOpen(false);
  }, [project]);

  return (
    <section className="flex flex-1 flex-col overflow-hidden">
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border pl-4 pr-6">
        {headerTitle ? (
          <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">{headerTitle}</h1>
        ) : (
          <span />
        )}
        <div className="flex shrink-0 items-center gap-3">
          {project && !settingsOpen && <Tabs tab={tab} onTab={onTab} />}
          <button
            type="button"
            onClick={() => setSettingsOpen((p) => !p)}
            aria-label="설정"
            aria-expanded={settingsOpen}
            title="설정"
            className={`rounded-md p-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
              settingsOpen
                ? "bg-surface-2 text-fg"
                : "text-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            <IconSettings size={18} stroke={1.75} />
          </button>
        </div>
      </header>

      {settingsOpen ? (
        <SettingsView />
      ) : !project ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted">
          <IconTelescope size={40} stroke={1.25} />
          <p className="text-sm">왼쪽에서 프로젝트를 선택하세요.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden pl-4 pr-6 py-5">
          {tab === "plan" ? (
            <PlanView key={`${project}-plan`} project={project} />
          ) : tab === "process" ? (
            <ProcessView key={`${project}-process`} project={project} />
          ) : (
            <FeaturesView
              key={`${project}-features`}
              project={project}
              view={view}
              onView={onView}
            />
          )}
        </div>
      )}
    </section>
  );
}