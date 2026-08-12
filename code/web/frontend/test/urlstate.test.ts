import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, it, expect } from "vitest";
import { useUrlState } from "../src/hooks/useUrlState";

beforeEach(() => {
  window.history.pushState({}, "", "/");
});

describe("useUrlState", () => {
  it("초기 = project null · tab features", () => {
    const { result } = renderHook(() => useUrlState());
    expect(result.current.project).toBeNull();
    expect(result.current.tab).toBe("features");
  });

  it("setProject → URL `?p=` 반영", () => {
    const { result } = renderHook(() => useUrlState());
    act(() => result.current.setProject("jinwooauto"));
    expect(result.current.project).toBe("jinwooauto");
    expect(new URLSearchParams(window.location.search).get("p")).toBe("jinwooauto");
  });

  it("setTab features → URL `?tab=features`", () => {
    const { result } = renderHook(() => useUrlState());
    act(() => result.current.setTab("features"));
    expect(result.current.tab).toBe("features");
    expect(new URLSearchParams(window.location.search).get("tab")).toBe("features");
  });

  it("초기값을 URL 에서 읽음", () => {
    window.history.pushState({}, "", "/?p=tuya&tab=features");
    const { result } = renderHook(() => useUrlState());
    expect(result.current.project).toBe("tuya");
    expect(result.current.tab).toBe("features");
  });

  it("setTab plan → URL `?tab=plan`, `?view=` 초기화(티켓 03)", () => {
    window.history.pushState({}, "", "/?p=x&tab=features&view=board");
    const { result } = renderHook(() => useUrlState());
    act(() => result.current.setTab("plan"));
    expect(result.current.tab).toBe("plan");
    expect(new URLSearchParams(window.location.search).get("tab")).toBe("plan");
    expect(result.current.view).toBeNull();
  });

  it("`?tab=plan` 을 북마크로 열면 plan 탭으로 그대로 열린다", () => {
    window.history.pushState({}, "", "/?p=x&tab=plan&view=feature");
    const { result } = renderHook(() => useUrlState());
    expect(result.current.tab).toBe("plan");
    expect(result.current.view).toBe("feature");
  });

  it("🔴 없어진 탭을 가리키는 옛 링크는 features 로 떨어진다 — 빈 화면이 아니다", () => {
    window.history.pushState({}, "", "/?p=tuya&tab=lineage");
    const { result } = renderHook(() => useUrlState());
    expect(result.current.tab).toBe("features");
  });

  it("setTab process → URL `?tab=process`(plan-board/07)", () => {
    window.history.pushState({}, "", "/?p=x&tab=features");
    const { result } = renderHook(() => useUrlState());
    act(() => result.current.setTab("process"));
    expect(result.current.tab).toBe("process");
    expect(new URLSearchParams(window.location.search).get("tab")).toBe("process");
  });

  it("`?tab=process` 를 북마크로 열면 process 탭으로 그대로 열린다 — 새로 고쳐도 열려 있다", () => {
    window.history.pushState({}, "", "/?p=x&tab=process");
    const { result } = renderHook(() => useUrlState());
    expect(result.current.tab).toBe("process");
  });

  it("setView → `?view=` 반영", () => {
    const { result } = renderHook(() => useUrlState());
    act(() => result.current.setView("board"));
    expect(result.current.view).toBe("board");
    expect(new URLSearchParams(window.location.search).get("view")).toBe("board");
  });

  it("setView(null) → `?view=` 제거(드로어를 ESC/닫기로 닫을 때)", () => {
    window.history.pushState({}, "", "/?p=x&tab=features&view=auth-login%2Fspec.md");
    const { result } = renderHook(() => useUrlState());
    expect(result.current.view).toBe("auth-login/spec.md");
    act(() => result.current.setView(null));
    expect(result.current.view).toBeNull();
    expect(new URLSearchParams(window.location.search).get("view")).toBeNull();
  });

  it("setTab 은 view 초기화(다른 탭 모드 안 샘)", () => {
    window.history.pushState({}, "", "/?p=x&tab=features&view=board");
    const { result } = renderHook(() => useUrlState());
    expect(result.current.view).toBe("board");
    act(() => result.current.setTab("features"));
    expect(result.current.view).toBeNull();
    expect(new URLSearchParams(window.location.search).get("view")).toBeNull();
  });

  it("setTab 은 focus 도 초기화한다", () => {
    window.history.pushState({}, "", "/?p=x&tab=plan&focus=auth-login");
    const { result } = renderHook(() => useUrlState());
    expect(result.current.focus).toBe("auth-login");
    act(() => result.current.setTab("features"));
    expect(result.current.focus).toBeNull();
  });

  it("goToPlanFeature → tab=plan + view=feature + focus", () => {
    window.history.pushState({}, "", "/?p=x&tab=features");
    const { result } = renderHook(() => useUrlState());
    act(() => result.current.goToPlanFeature("auth-login"));
    expect(result.current.tab).toBe("plan");
    expect(result.current.view).toBe("feature");
    expect(result.current.focus).toBe("auth-login");
  });
});
