import { Sidebar } from "./components/sidebar/Sidebar";
import { MainPanel } from "./components/main/MainPanel";
import { useUrlState } from "./hooks/useUrlState";

/** 셸 — 사이드바(프로젝트) + 메인(본문 header + features 탭). 브랜드=본문 header 좌측, 테마=사이드바 하단. */
export function App() {
  const { project, tab, setProject, setTab } = useUrlState();

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-fg">
      <Sidebar selected={project} onSelect={setProject} />
      <MainPanel project={project} tab={tab} onTab={setTab} />
    </div>
  );
}
