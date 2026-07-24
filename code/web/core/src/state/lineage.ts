import type { LineageNode, LineageEdge, Supersession, DropRecord, TodoItem } from "@gootte/contract";
import type { AdrInfo } from "../parse/adr";

/**
 * 순수 lineage 채움 (W3 분리) — supersede/drop 엣지.
 * INV-4: 판정=결정적 키워드, 산문 "왜"=verbatim note(요약 X).
 */

const REFERENCE_KW = ["참조됨", "소비", "선행 의존"];
const PARTIAL_KW = ["부분", "유지", "살", "생존"];

/** 우선순위 reference > partial > supersede (B1). */
export function supersedeKind(note: string): "supersede" | "supersede-partial" | "reference" {
  if (REFERENCE_KW.some((k) => note.includes(k))) return "reference";
  if (PARTIAL_KW.some((k) => note.includes(k))) return "supersede-partial";
  return "supersede";
}

const adrRefs = (s: string): string[] => [...s.matchAll(/ADR-\d+/g)].map((m) => m[0]);

export interface LineageFill {
  nodes: LineageNode[];
  edges: LineageEdge[];
  drops: DropRecord[];
}

export function buildLineage(input: {
  supersessions: Supersession[];
  adrs: AdrInfo[];
  todos: TodoItem[];
}): LineageFill {
  const nodes: LineageNode[] = [];
  const edges: LineageEdge[] = [];
  const drops: DropRecord[] = [];

  // 1. INDEX Supersession (1차) → edge, 키워드 판정, note verbatim, adr
  for (const s of input.supersessions) {
    edges.push({ from: s.old, to: s.new, kind: supersedeKind(s.note), note: s.note, adr: s.adr });
  }

  // 2. ADR 체인 (Status: superseded by) → adr 노드 + supersede edge
  for (const a of input.adrs) {
    if (!a.id) continue;
    nodes.push({ id: a.id, kind: "adr", status: a.status });
    if (a.supersededBy) {
      edges.push({
        from: a.id,
        to: a.supersededBy,
        kind: "supersede",
        note: "",
        adr: [a.id, a.supersededBy],
      });
    }
  }

  // 3. dropped todo (resolvedBy) → DropRecord + edge (verbatim resolvedBy)
  for (const t of input.todos) {
    if (t.status !== "dropped" || !t.resolvedBy) continue;
    drops.push({
      todo: t.slug,
      initiative: t.initiative ?? null,
      resolvedBy: t.resolvedBy,
      at: t.completedAt ?? t.created,
    });
    edges.push({
      from: t.slug,
      to: t.resolvedBy,
      kind: "supersede",
      note: t.resolvedBy,
      adr: adrRefs(t.resolvedBy),
    });
  }

  return { nodes, edges, drops };
}
