import { IconArrowNarrowRight, IconTag } from "@tabler/icons-react";
import type { LineageEdge } from "@gootte/contract";

const KIND_META: Record<string, { label: string; cls: string }> = {
  supersede: { label: "대체", cls: "text-supersede" },
  "supersede-partial": { label: "부분대체", cls: "text-partial" },
  reference: { label: "참조", cls: "text-muted" },
  spawn: { label: "파생", cls: "text-accent" },
  dep: { label: "의존", cls: "text-muted" },
};

/** supersede 엣지 한 줄 — from → to + kind(색) + ADR 배지 + note verbatim. kind 해소=서버(INV-4). */
export function EdgeRow({ edge }: { edge: LineageEdge }) {
  const meta = KIND_META[edge.kind] ?? { label: edge.kind, cls: "text-muted" };
  const partial = edge.kind === "supersede-partial";
  return (
    <li className={`border-l-2 py-1.5 pl-3 ${partial ? "border-partial" : "border-border"}`}>
      <div className="flex flex-wrap items-baseline gap-1.5 text-base">
        <span className="mono text-muted">{edge.from}</span>
        <IconArrowNarrowRight size={14} className="shrink-0 text-border" />
        <span className={`mono font-medium ${meta.cls}`}>{edge.to}</span>
        <span className={`mono text-sm ${meta.cls} opacity-80`}>{meta.label}</span>
        {edge.adr?.map((a) => (
          <span
            key={a}
            className="mono inline-flex items-center gap-0.5 rounded bg-surface-2 px-1 py-0.5 text-sm text-muted"
          >
            <IconTag size={9} /> {a}
          </span>
        ))}
      </div>
      {edge.note && <p className="mt-1 pl-1 text-base leading-relaxed text-muted">{edge.note}</p>}
    </li>
  );
}
