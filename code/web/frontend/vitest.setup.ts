import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// 렌더 누적(다중 요소) 방지 — RTL auto-cleanup 은 globals 없으면 수동 등록.
afterEach(() => cleanup());

// jsdom 은 matchMedia 미구현 → ThemeProvider 용 최소 스텁(기본 light).
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// jsdom 은 ResizeObserver 미구현 → useResizableSplit(plan-board 손잡이) 용 최소 스텁.
// 실제로 재지는 않는다 — 테스트는 컨테이너 실측 높이가 필요 없고, 관찰만 조용히 성립하면 된다.
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
