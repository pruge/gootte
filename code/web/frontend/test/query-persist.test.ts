import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachSaver } from "../src/lib/query";

const KEY = "gootte-query-cache-v1";

function storedKeys(): unknown[] {
  const raw = localStorage.getItem(KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as { queries?: Array<{ queryKey?: unknown[] }> };
  return (parsed.queries ?? []).map((q) => q.queryKey?.[0]);
}

function hideDocument(): void {
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("attachSaver — dirty + 닫힘 flush (query-persist-on-hide)", () => {
  let qc: QueryClient;
  let close: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    qc = new QueryClient();
    close = attachSaver(qc);
  });
  afterEach(() => {
    close();
    vi.useRealTimers();
    localStorage.clear();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  it("캐시 변경만으로는 저장되지 않는다 — 60초 전에는 조용하다", () => {
    qc.setQueryData(["projects"], [{ slug: "a" }]);
    vi.advanceTimersByTime(59_000);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("60초 안전망에 dirty 가 있으면 저장된다", () => {
    qc.setQueryData(["projects"], [{ slug: "a" }]);
    vi.advanceTimersByTime(60_000);
    expect(storedKeys()).toEqual(["projects"]);
  });

  it("탭 숨김에 즉시 저장된다(타이머 안 기다림)", () => {
    qc.setQueryData(["projects"], [{ slug: "a" }]);
    hideDocument();
    expect(storedKeys()).toEqual(["projects"]);
  });

  it("pagehide 에 저장된다", () => {
    qc.setQueryData(["plan", "a"], { project: "a" });
    window.dispatchEvent(new Event("pagehide"));
    expect(storedKeys()).toEqual(["plan"]);
  });

  it("featureDoc 은 저장하지 않는다", () => {
    qc.setQueryData(["projects"], [{ slug: "a" }]);
    qc.setQueryData(["featureDoc", "a", "f", "spec.md"], "본문");
    vi.advanceTimersByTime(60_000);
    expect(storedKeys()).toEqual(["projects"]);
  });

  it("바뀐 것 없으면 60초가 지나도 쓰지 않는다", () => {
    vi.advanceTimersByTime(120_000);
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
