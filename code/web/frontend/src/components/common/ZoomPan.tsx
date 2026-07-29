import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { IconZoomIn, IconZoomOut, IconArrowsMaximize } from "@tabler/icons-react";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const MIN = 0.1; // 10% 까지 축소
const MAX = 20; // 2000% 까지 확대

/**
 * 자식(다이어그램 등)을 확대/축소·이동 뷰포트에 담는다.
 * 열릴 때(콘텐츠 크기 확정 시) 화면 맞춤 자동 · 휠 줌 · 드래그 이동 · +/−/맞춤 버튼.
 */
export function ZoomPan({ children }: { children: ReactNode }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  const fit = useCallback(() => {
    const vp = viewportRef.current;
    const ct = contentRef.current;
    if (!vp || !ct) return;
    const cw = ct.scrollWidth;
    const ch = ct.scrollHeight;
    if (!cw || !ch || !vp.clientWidth) return; // 아직 미렌더(jsdom 등) → skip
    setScale(clamp(Math.min((vp.clientWidth - 24) / cw, (vp.clientHeight - 24) / ch), MIN, MAX));
    setPan({ x: 0, y: 0 });
  }, []);

  // 비동기 SVG 크기 확정되면 자동 맞춤(ResizeObserver 미지원 환경은 skip).
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const ct = contentRef.current;
    if (!ct) return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(ct);
    return () => ro.disconnect();
  }, [fit]);

  // 휠 줌 — passive:false 로 preventDefault 허용(페이지 스크롤 대신 줌).
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setScale((s) => clamp(s * (e.deltaY < 0 ? 1.12 : 1 / 1.12), MIN, MAX));
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
  };
  const endDrag = () => {
    drag.current = null;
  };

  const btn =
    "rounded p-1 text-muted transition-colors hover:bg-fg/[0.06] hover:text-fg focus-visible:outline-2 focus-visible:outline-accent";
  return (
    <div className="relative h-full min-h-0">
      <div className="absolute right-2 top-2 z-10 flex gap-0.5 rounded-lg border border-border bg-surface/90 p-1 shadow-sm">
        <button type="button" className={btn} onClick={() => setScale((s) => clamp(s * 1.2, MIN, MAX))} aria-label="확대">
          <IconZoomIn size={16} />
        </button>
        <button type="button" className={btn} onClick={() => setScale((s) => clamp(s / 1.2, MIN, MAX))} aria-label="축소">
          <IconZoomOut size={16} />
        </button>
        <button type="button" className={btn} onClick={fit} aria-label="화면 맞춤">
          <IconArrowsMaximize size={16} />
        </button>
      </div>
      <div
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        className="flex h-full cursor-grab items-center justify-center overflow-hidden active:cursor-grabbing"
      >
        <div
          ref={contentRef}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: "center center",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
