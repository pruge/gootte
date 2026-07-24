import { IconTopologyStar3 } from "@tabler/icons-react";
import { Sidebar } from "./components/sidebar/Sidebar";
import { MainPanel } from "./components/main/MainPanel";
import { ThemeToggle } from "./theme/ThemeToggle";
import { useUrlState } from "./hooks/useUrlState";

/** 2a 셸 — 상단 바 + 사이드바(프로젝트) + 메인(plan/lineage 탭). 뷰 본체 = 010. */
export function App() {
  const { project, tab, setProject, setTab } = useUrlState();

  return (
    <div className="flex h-screen flex-col bg-bg text-fg">
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-2.5">
        <div className="flex items-center gap-2">
          <IconTopologyStar3 size={20} className="text-accent" stroke={1.75} />
          <span className="text-sm font-semibold tracking-tight">gootte</span>
          <span className="mono text-[0.65rem] text-muted">프로젝트 관리</span>
        </div>
        <ThemeToggle />
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar selected={project} onSelect={setProject} />
        <MainPanel project={project} tab={tab} onTab={setTab} />
      </div>
    </div>
  );
}
