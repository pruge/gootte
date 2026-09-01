import { useEffect } from "react";
import { IconSettings, IconTelescope } from "@tabler/icons-react";
import type { Tab } from "../../hooks/useUrlState";
import { MemoView } from "../memo/MemoView";
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
  /** 설정 창 열림 — 셸(App)이 들고 있다. 사이드바 클릭(어느 프로젝트든)·ESC 로 닫힌다. */
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
}

export function MainPanel({
  project,
  tab,
  onTab,
  view,
  onView,
  settingsOpen,
  onSettingsOpenChange,
}: MainPanelProps) {
  const headerTitle = settingsOpen ? "Settings" : project;

  // ESC — 설정이 열려 있으면 닫는다
  useEffect(() => {
    if (!settingsOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onSettingsOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [settingsOpen, onSettingsOpenChange]);

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
            onClick={() => onSettingsOpenChange(!settingsOpen)}
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
          {tab === "memo" ? (
            <MemoView key={`${project}-memo`} project={project} />
          ) : tab === "plan" ? (
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