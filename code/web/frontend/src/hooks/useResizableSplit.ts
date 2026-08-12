import {
  useCallback,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

/** 키보드 화살표 한 번의 이동폭(px) — 마우스 없이도 조절 가능하게(접근성). */
const KEY_STEP = 16;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function readStored(key: string, fallback: number): number {
  if (typeof localStorage === "undefined") return fallback;
  const raw = Number(localStorage.getItem(key));
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

export interface ResizableSplitOptions {
  /** 저장값이 없을 때(첫 방문) 쓸 높이(px). */
  defaultHeight: number;
  /** 아무리 끌어도 이 아래로는 줄지 않는다 — 완전히 접히면 다시 늘릴 손잡이를 잃는다. */
  min: number;
  /** 위 칸(컨테이너의 나머지 자리를 갖는 쪽)의 몫을 지켜주는 상한 — 컨테이너 실측 높이의 비율.
   * px 로 못 박지 않는다: 이웃 요소(헤더 등)의 치수를 여기서 다시 알 필요가 없고, 창 크기가
   * 바뀌어도 늘 위 칸 몫이 비율만큼 남는다. */
  maxRatio?: number;
}

/**
 * 위아래 두 칸을 가르는 손잡이 하나의 높이 상태(캡틴 지시, plan-board) — 아래 칸 높이만
 * 여기서 정하고, 위 칸은 부모의 `flex-1` 이 남는 공간을 그대로 흡수한다(따로 계산하지 않는다).
 * 마지막 값은 `localStorage` 에 남아 다음에 이 화면을 열 때도 같은 자리를 기억한다.
 *
 * 🔴 저장 키는 호출자가 주는 문자열 하나뿐이다 — 여러 손잡이가 하나의 훅을 같이 쓰면 키를
 * 서로 다르게 주어야 한다(이 프로젝트엔 지금 하나뿐이라 부딪힐 일은 없다).
 *
 * 🔴 컨테이너는 **콜백 ref**로 받는다(호출자가 만든 `useRef` 를 건네받지 않는다) — 이 화면은
 * 로딩 중엔 다른 트리를 그리다가 데이터가 오면 이 손잡이가 있는 트리로 바뀐다. 일반
 * `RefObject` + `useEffect([containerRef])` 조합은 ref *객체*가 안 바뀌었다는 이유로 그
 * "늦게 붙는 노드" 를 놓친다 — 콜백 ref 는 노드가 실제로 DOM 에 붙는 순간에 불려 이 문제가 없다.
 */
export function useResizableSplit(
  storageKey: string,
  { defaultHeight, min, maxRatio = 0.7 }: ResizableSplitOptions,
) {
  const [height, setHeight] = useState(() => readStored(storageKey, defaultHeight));
  const [containerHeight, setContainerHeight] = useState(0);
  const drag = useRef<{ startY: number; startHeight: number } | null>(null);
  const observer = useRef<ResizeObserver | null>(null);

  const containerRef = useCallback((node: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setContainerHeight(entry.contentRect.height);
    });
    ro.observe(node);
    observer.current = ro;
  }, []);

  // 컨테이너를 아직 못 재면(첫 렌더) 상한을 걸지 않는다 — 저장된 값을 순간적으로 잘라내지 않기 위해서다.
  const max = containerHeight > 0 ? Math.max(min, containerHeight * maxRatio) : Infinity;
  const clamped = clamp(height, min, max);

  const commit = useCallback(
    (next: number) => {
      const value = clamp(next, min, max);
      setHeight(value);
      try {
        localStorage.setItem(storageKey, String(value));
      } catch {
        /* 저장 불가 환경(사생활 보호 모드 등) — 이번 방문 안에서만 기억한다 */
      }
    },
    [storageKey, min, max],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      e.preventDefault();
      // `preventDefault` 는 끌기가 텍스트를 선택하며 시작되는 것을 막는 부작용으로, 이 요소가
      // (버튼과 달리) pointerdown 만으로 포커스를 받는 기본 동작까지 함께 죽인다 — 화살표 키
      // 조절이 안 먹는 채로 남지 않도록 여기서 직접 포커스를 준다.
      e.currentTarget.focus();
      drag.current = { startY: e.clientY, startHeight: clamped };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [clamped],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!drag.current) return;
      // 손잡이를 위로 끌수록(포인터가 위로 갈수록 dy 양수) 아래 칸이 커진다 — 경계를 위로
      // 미는 것과 같은 방향이라 손이 기억하는 방향과 어긋나지 않는다.
      const dy = drag.current.startY - e.clientY;
      commit(drag.current.startHeight + dy);
    },
    [commit],
  );

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLElement>) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        commit(clamped + KEY_STEP);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        commit(clamped - KEY_STEP);
      } else if (e.key === "Home") {
        e.preventDefault();
        commit(min);
      } else if (e.key === "End" && Number.isFinite(max)) {
        e.preventDefault();
        commit(max);
      }
    },
    [clamped, commit, min, max],
  );

  return {
    containerRef,
    height: clamped,
    min,
    max: Number.isFinite(max) ? max : undefined,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onKeyDown,
  };
}
