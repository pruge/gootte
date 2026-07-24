import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, it, expect } from "vitest";
import { useUrlState } from "../src/hooks/useUrlState";

beforeEach(() => {
  window.history.pushState({}, "", "/");
});

describe("useUrlState", () => {
  it("초기 = project null · tab plan", () => {
    const { result } = renderHook(() => useUrlState());
    expect(result.current.project).toBeNull();
    expect(result.current.tab).toBe("plan");
  });

  it("setProject → URL `?p=` 반영", () => {
    const { result } = renderHook(() => useUrlState());
    act(() => result.current.setProject("jinwooauto"));
    expect(result.current.project).toBe("jinwooauto");
    expect(new URLSearchParams(window.location.search).get("p")).toBe("jinwooauto");
  });

  it("setTab lineage → URL `?tab=lineage`", () => {
    const { result } = renderHook(() => useUrlState());
    act(() => result.current.setTab("lineage"));
    expect(result.current.tab).toBe("lineage");
    expect(new URLSearchParams(window.location.search).get("tab")).toBe("lineage");
  });

  it("초기값을 URL 에서 읽음", () => {
    window.history.pushState({}, "", "/?p=tuya&tab=lineage");
    const { result } = renderHook(() => useUrlState());
    expect(result.current.project).toBe("tuya");
    expect(result.current.tab).toBe("lineage");
  });
});
