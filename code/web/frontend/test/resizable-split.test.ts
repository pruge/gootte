import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useResizableSplit } from "../src/hooks/useResizableSplit";

const KEY = "test-split-h";

type RoEntry = { contentRect: { height: number } };
let roCallback: ((entries: RoEntry[]) => void) | null = null;

/** 진짜 ResizeObserver 대신 — 콜백만 붙잡아 두고 테스트가 원하는 실측값을 손으로 흘려보낸다. */
class FakeResizeObserver {
  constructor(cb: (entries: RoEntry[]) => void) {
    roCallback = cb;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

const key = (k: string) => ({ key: k, preventDefault: () => {} }) as unknown as Parameters<
  ReturnType<typeof mount>["result"]["current"]["onKeyDown"]
>[0];

function mount(opts: { defaultHeight?: number; min?: number; maxRatio?: number } = {}) {
  return renderHook(() =>
    useResizableSplit(KEY, {
      defaultHeight: opts.defaultHeight ?? 200,
      min: opts.min ?? 100,
      maxRatio: opts.maxRatio,
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  roCallback = null;
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
});

afterEach(() => vi.unstubAllGlobals());

describe("useResizableSplit — 위아래 손잡이 높이(캡틴 지시, plan-board)", () => {
  it("저장된 값이 없으면 defaultHeight 로 시작한다", () => {
    const { result } = mount();
    expect(result.current.height).toBe(200);
  });

  it("저장된 값이 있으면 그 값에서 시작한다 — 다음에 열어도 같은 자리를 기억한다", () => {
    localStorage.setItem(KEY, "260");
    const { result } = mount();
    expect(result.current.height).toBe(260);
  });

  it("🔴 컨테이너를 아직 못 재면 상한이 없다 — 저장된 값을 순간적으로 잘라내지 않는다", () => {
    localStorage.setItem(KEY, "9999");
    const { result } = mount();
    expect(result.current.height).toBe(9999);
    expect(result.current.max).toBeUndefined();
  });

  it("컨테이너 실측 높이가 오면 비율만큼(기본 0.7) 상한이 걸린다", () => {
    const { result } = mount();
    act(() => result.current.containerRef(document.createElement("div")));
    act(() => roCallback?.([{ contentRect: { height: 1000 } }]));
    expect(result.current.max).toBe(700);
    expect(result.current.height).toBe(200); // 기본값은 상한 밑이라 그대로다
  });

  it("🔴 화살표 위/아래로 한 걸음씩 움직이고 localStorage 에 남는다", () => {
    const { result } = mount();
    act(() => result.current.onKeyDown(key("ArrowUp")));
    expect(result.current.height).toBe(216);
    expect(localStorage.getItem(KEY)).toBe("216");

    act(() => result.current.onKeyDown(key("ArrowDown")));
    expect(result.current.height).toBe(200);
    expect(localStorage.getItem(KEY)).toBe("200");
  });

  it("🔴 Home 은 최소로, End 는 상한으로 보낸다", () => {
    const { result } = mount();
    act(() => result.current.containerRef(document.createElement("div")));
    act(() => roCallback?.([{ contentRect: { height: 1000 } }]));

    act(() => result.current.onKeyDown(key("Home")));
    expect(result.current.height).toBe(100);

    act(() => result.current.onKeyDown(key("End")));
    expect(result.current.height).toBe(700);
  });

  it("🔴 아무리 줄여도 min 아래로는 안 내려간다 — 완전히 접히면 다시 늘릴 손잡이를 잃는다", () => {
    const { result } = mount();
    for (let i = 0; i < 20; i++) {
      act(() => result.current.onKeyDown(key("ArrowDown")));
    }
    expect(result.current.height).toBe(100);
  });

  it("🔴 아무리 늘려도 상한(위 칸 몫) 위로는 안 올라간다", () => {
    const { result } = mount();
    act(() => result.current.containerRef(document.createElement("div")));
    act(() => roCallback?.([{ contentRect: { height: 300 } }])); // max = 210
    for (let i = 0; i < 20; i++) {
      act(() => result.current.onKeyDown(key("ArrowUp")));
    }
    expect(result.current.height).toBe(210);
  });

  it("포인터로 끌면 위로 끌수록(dy 양수) 아래 칸이 커진다", () => {
    const { result } = mount();
    const target = { setPointerCapture: () => {}, releasePointerCapture: () => {}, focus: () => {} };
    act(() =>
      result.current.onPointerDown({
        clientY: 500,
        pointerId: 1,
        preventDefault: () => {},
        currentTarget: target,
      } as any),
    );
    act(() =>
      result.current.onPointerMove({
        clientY: 460, // 40px 위로
        currentTarget: target,
      } as any),
    );
    expect(result.current.height).toBe(240); // 200 + 40
  });
});
