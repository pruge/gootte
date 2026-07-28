import type { StructureDiagram } from "@gootte/contract";
import { MermaidBlock } from "../common/MermaidBlock";

/** 포커스된 저작 다이어그램 1개 — 헤더(id·title·상태) + mermaid 렌더 + sources. INV-2 read-only. */
export function DiagramFocus({ diagram }: { diagram: StructureDiagram }) {
  const superseded = diagram.status === "superseded";
  return (
    <article className={`min-w-0 flex-1 overflow-y-auto ${superseded ? "opacity-60" : ""}`}>
      <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="mono text-sm font-semibold text-accent">{diagram.id}</span>
        <h2 className="text-lg font-semibold tracking-tight text-fg">{diagram.title}</h2>
        <span
          className={`mono rounded px-1.5 py-0.5 text-xs ${
            superseded ? "bg-surface-2 text-muted" : "bg-accent/10 text-accent"
          }`}
        >
          {superseded ? "⚫ superseded" : "🟢 living"}
        </span>
      </header>
      <MermaidBlock code={diagram.code} />
      {diagram.sources.length > 0 && (
        <p className="mono mt-2 truncate text-xs text-muted">sources: {diagram.sources.join(" · ")}</p>
      )}
    </article>
  );
}
