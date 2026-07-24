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
