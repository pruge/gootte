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

// jsdom 은 레이아웃을 안 한다 — offsetHeight 가 항상 0이라 TanStack Virtual(가상 스크롤,
// a-long-list-stays-usable/02)이 뷰포트를 0으로 보고 아무 줄도 창에 못 넣는다. 실제 픽셀
// 판정은 캡틴이 브라우저로 한다(이 자리는 그럴 자격이 없다, INV-V2) — 여기선 창이 실제로
// 마운트·언마운트되는지(스크롤로 밀려났다 돌아오는지)만 검증할 수 있으면 된다. 그래서
// 가상 스크롤 컨테이너·줄에만 표시를 두고 고정 높이를 흉내낸다 — 그 표시가 없는 다른 모든
// 요소는 기존 그대로 0을 돌려받는다.
const VIRTUAL_VIEWPORT_HEIGHT = 600;
const VIRTUAL_ROW_HEIGHT = 80;
Object.defineProperty(window.HTMLElement.prototype, "offsetHeight", {
  configurable: true,
  get(this: HTMLElement) {
    if (this.hasAttribute("data-virtual-viewport")) return VIRTUAL_VIEWPORT_HEIGHT;
    if (this.hasAttribute("data-virtual-row")) return VIRTUAL_ROW_HEIGHT;
    return 0;
  },
});

// jsdom 은 Element.scrollTo 를 구현하지 않는다 — 포커스 복귀(②)가 쓰는 프로그램적 스크롤
// (`scrollToIndex`)이 실제로 scrollTop 을 옮기고 'scroll' 이벤트를 내야 가상 스크롤 창이
// 따라 움직인다.
if (!window.Element.prototype.scrollTo) {
  window.Element.prototype.scrollTo = function (this: Element, opts?: ScrollToOptions | number) {
    const top = typeof opts === "object" && opts !== null ? opts.top : undefined;
    if (typeof top === "number") {
      this.scrollTop = top;
      this.dispatchEvent(new Event("scroll"));
    }
  };
}
