import { useCallback, useEffect, useState } from "react";

export type Tab = "plan" | "lineage";
export interface UrlState {
  project: string | null;
  tab: Tab;
}

function read(): UrlState {
  const sp = new URLSearchParams(window.location.search);
  return { project: sp.get("p"), tab: sp.get("tab") === "lineage" ? "lineage" : "plan" };
}

function write(next: UrlState): void {
  const sp = new URLSearchParams();
  if (next.project) sp.set("p", next.project);
  sp.set("tab", next.tab);
  const qs = sp.toString();
  window.history.pushState({}, "", qs ? `?${qs}` : window.location.pathname);
}

/** 네비 상태(선택 프로젝트·탭)를 URL search param 으로. 공유가능(터널)·북마크. */
export function useUrlState() {
  const [state, setState] = useState<UrlState>(read);

  useEffect(() => {
    const on = () => setState(read());
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);

  const update = useCallback((patch: Partial<UrlState>) => {
    const next = { ...read(), ...patch };
    write(next);
    setState(next);
  }, []);

  return {
    project: state.project,
    tab: state.tab,
    setProject: useCallback((p: string) => update({ project: p }), [update]),
    setTab: useCallback((t: Tab) => update({ tab: t }), [update]),
  };
}
