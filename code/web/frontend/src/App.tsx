import { useState } from "react";
import { Sidebar } from "./components/sidebar/Sidebar";
import { MainPanel } from "./components/main/MainPanel";
import { useUrlState } from "./hooks/useUrlState";
import { useKeyboardNav } from "./hooks/useKeyboardNav";
import { useProjects } from "./lib/query";

/** 셸 — 사이드바(프로젝트) + 메인(본문 header + features 탭). 브랜드=본문 header 좌측, 테마=사이드바 하단. */
export function App() {
  const { project, tab, view, setProject, setTab, setView } = useUrlState();
  const { data: projects } = useProjects();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 🔴 어느 프로젝트를 클릭하든(현재 선택한 것까지 포함) 설정을 닫는다 —
  // project prop 이 안 바뀌는 같은 프로젝트 클릭도 닫혀야 하므로(캡틴 보고 2026-09-02),
  // useEffect([project]) 로는 부족하다 — 클릭하는 그 자리에서 닫아야 한다.
  const handleSelectProject = (slug: string) => {
    setSettingsOpen(false);
    setProject(slug);
  };

  useKeyboardNav({
    project,
    projects: projects?.map((p) => p.slug) ?? [],
    onSelectProject: handleSelectProject,
    tab,
    onSelectTab: setTab,
  });

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-fg">
      <Sidebar selected={project} onSelect={handleSelectProject} />
      <MainPanel
        project={project}
        tab={tab}
        onTab={setTab}
        view={view}
        onView={setView}
        settingsOpen={settingsOpen}
        onSettingsOpenChange={setSettingsOpen}
      />
    </div>
  );
}
