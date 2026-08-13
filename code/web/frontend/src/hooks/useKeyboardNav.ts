import { useEffect } from "react";
import type { Tab } from "./useUrlState";

const TAB_ORDER: readonly Tab[] = ["features", "plan", "process"];

interface KeyboardNavArgs {
  project: string | null;
  projects: readonly string[];
  onSelectProject: (slug: string) => void;
  tab: Tab;
  onSelectTab: (t: Tab) => void;
}

function cycle<T>(list: readonly T[], current: T | null, delta: 1 | -1): T {
  const idx = current === null ? -1 : list.indexOf(current);
  return list[(idx + delta + list.length) % list.length] as T;
}

/** cmd+←/→ 는 탭(features|plan|steps)을, cmd+↑/↓ 는 사이드바 프로젝트를 순환한다. */
export function useKeyboardNav({
  project,
  projects,
  onSelectProject,
  tab,
  onSelectTab,
}: KeyboardNavArgs) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey) return;

      if (project && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        onSelectTab(cycle(TAB_ORDER, tab, e.key === "ArrowLeft" ? -1 : 1));
        return;
      }

      if (projects.length > 0 && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        onSelectProject(cycle(projects, project, e.key === "ArrowUp" ? -1 : 1));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [project, projects, onSelectProject, tab, onSelectTab]);
}
