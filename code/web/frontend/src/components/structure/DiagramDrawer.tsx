import { useEffect } from "react";
import { IconX } from "@tabler/icons-react";
import type { StructureDiagram } from "@gootte/contract";
import { MermaidBlock } from "../common/MermaidBlock";

interface DiagramDrawerProps {
  diagram: StructureDiagram;
  onClose: () => void;
}

/**
 * 다이어그램 뷰어 — 리스트의 DocDrawer 동형 우측 슬라이드오버.
 * mermaid 렌더. 닫기 = ESC · **회색 백드롭 클릭** · X. 넓은 폭(max-w-4xl) + 좌측 회색 여백 클릭영역.
 */
export function DiagramDrawer({ diagram, onClose }: DiagramDrawerProps) {
  const superseded = diagram.status === "superseded";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-20 flex justify-end">
      <button aria-label="닫기" className="absolute inset-0 bg-fg/20" onClick={onClose} />
      <aside
        role="dialog"
        aria-label={`다이어그램 ${diagram.id}`}
        className="relative flex h-full w-full max-w-4xl flex-col border-l border-border bg-surface shadow-2xl"
      >
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
          <span className="mono shrink-0 text-sm font-semibold text-accent">{diagram.id}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium tracking-tight">
            {diagram.title}
          </span>
          <span
            className={`mono shrink-0 rounded px-1.5 py-0.5 text-xs ${
              superseded ? "bg-surface-2 text-muted" : "bg-accent/10 text-accent"
            }`}
          >
            {superseded ? "⚫ superseded" : "🟢 living"}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded p-1 text-muted transition-colors hover:bg-fg/[0.06] hover:text-fg"
          >
            <IconX size={16} />
          </button>
        </header>
        <div className={`min-h-0 flex-1 overflow-auto p-5 ${superseded ? "opacity-60" : ""}`}>
          <MermaidBlock code={diagram.code} />
          {diagram.sources.length > 0 && (
            <p className="mono mt-3 truncate text-xs text-muted">
              sources: {diagram.sources.join(" · ")}
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
