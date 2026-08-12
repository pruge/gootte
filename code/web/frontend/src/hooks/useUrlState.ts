import { useCallback, useEffect, useState } from "react";
import { encodeDocView } from "../components/features/docView";

export type Tab = "features" | "plan";
const TABS: readonly Tab[] = ["features", "plan"];
export interface UrlState {
  project: string | null;
  tab: Tab;
  /** 탭별 뷰모드(raw) — 소비처가 유효값 해소. */
  view: string | null;
  /**
   * `plan` 탭에서 연 티켓 문서 주소(development-order/15 ⑤) — `features` 탭의 `view`(문서 주소)와
   * 같은 인코딩(`docView.ts`)을 쓰지만 자리는 따로 둔다. `plan` 탭은 `view` 를 이미 단계·기능
   * 보기 전환에 쓰고 있어(티켓 03), 문서 주소를 같은 칸에 실으면 두 뜻이 부딪힌다.
   */
  doc: string | null;
  /**
   * `features` 탭에서 건너와 `plan` 탭 기능 보기에서 포커스할 기능(development-order/16 ④).
   * 그 카드가 있는 자리로 스크롤한다. 새로고침해도 같은 자리가 열리도록 주소에 싣는다.
   */
  focus: string | null;
}

function read(): UrlState {
  const sp = new URLSearchParams(window.location.search);
  const rawTab = sp.get("tab");
  return {
    project: sp.get("p"),
    tab: (TABS as readonly string[]).includes(rawTab ?? "") ? (rawTab as Tab) : "features",
    view: sp.get("view"),
    doc: sp.get("doc"),
    focus: sp.get("focus"),
  };
}

function write(next: UrlState): void {
  const sp = new URLSearchParams();
  if (next.project) sp.set("p", next.project);
  sp.set("tab", next.tab);
  if (next.view) sp.set("view", next.view);
  if (next.doc) sp.set("doc", next.doc);
  if (next.focus) sp.set("focus", next.focus);
  const qs = sp.toString();
  window.history.pushState({}, "", qs ? `?${qs}` : window.location.pathname);
}

/** 네비 상태(선택 프로젝트·탭·뷰모드·plan 문서 주소)를 URL search param 으로. 공유가능(터널)·북마크. */
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
    doc: state.doc,
    focus: state.focus,
    setProject: useCallback((p: string) => update({ project: p }), [update]),
    // 탭 전환 시 view·doc·focus 초기화(다른 탭의 모드·열린 문서·포커스가 새지 않게)
    setTab: useCallback((t: Tab) => update({ tab: t, view: null, doc: null, focus: null }), [update]),
    setView: useCallback((v: string | null) => update({ view: v }), [update]),
    setDoc: useCallback((d: string | null) => update({ doc: d }), [update]),
    /** development-order/16 ④ — `features` 탭의 `plan` 버튼으로 `plan` 탭 기능 보기, 그 자리로 돌아간다. */
    goToPlanFeature: useCallback(
      (feature: string) => update({ tab: "plan", view: "feature", doc: null, focus: feature }),
      [update],
    ),
    /**
     * plan-board/03 — 판 위 카드의 문서 아이콘. `features` 탭의 **기존 통로**로 간다:
     * 여는 방법도 주소 서식도 그 탭이 이미 쓰던 것 그대로다(`view` = `docView.ts` 인코딩).
     * 🔴 두 번째 문서 보기를 짓지 않는다 — 이 함수가 하는 일은 탭과 주소를 바꾸는 것뿐이다.
     * 열 문서가 없으면(`path === null`) 탭만 건너간다 — 없는 문서를 지어내지 않는다.
     */
    goToFeatureDoc: useCallback(
      (feature: string, path: string | null) =>
        update({
          tab: "features",
          view: path ? encodeDocView(feature, path) : null,
          doc: null,
          focus: null,
        }),
      [update],
    ),
  };
}
