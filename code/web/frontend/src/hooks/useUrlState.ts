import { useCallback, useEffect, useState } from "react";

export type Tab = "plan" | "features" | "lineage";
const TABS: readonly Tab[] = ["plan", "features", "lineage"];
export interface UrlState {
  project: string | null;
  tab: Tab;
  /** 탭별 뷰모드(raw) — plan: list|structure|timeline · lineage: chain|graph. 소비처가 유효값 해소. */
  view: string | null;
}

function read(): UrlState {
  const sp = new URLSearchParams(window.location.search);
  const rawTab = sp.get("tab");
  return {
    project: sp.get("p"),
    tab: (TABS as readonly string[]).includes(rawTab ?? "") ? (rawTab as Tab) : "plan",
    view: sp.get("view"),
  };
}

function write(next: UrlState): void {
  const sp = new URLSearchParams();
  if (next.project) sp.set("p", next.project);
  sp.set("tab", next.tab);
  if (next.view) sp.set("view", next.view);
  const qs = sp.toString();
  window.history.pushState({}, "", qs ? `?${qs}` : window.location.pathname);
}

/** 네비 상태(선택 프로젝트·탭·뷰모드)를 URL search param 으로. 공유가능(터널)·북마크. */
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
    view: state.view,
    setProject: useCallback((p: string) => update({ project: p }), [update]),
    // 탭 전환 시 view 초기화(다른 탭의 모드가 새지 않게)
    setTab: useCallback((t: Tab) => update({ tab: t, view: null }), [update]),
    setView: useCallback((v: string) => update({ view: v }), [update]),
  };
}
