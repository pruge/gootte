import type { Supersession } from "@gootte/contract";

/** roadmap `INDEX.md` → Now/Next 순서 + 이니셔티브 표 + Supersession 색인. */
export interface IndexInfo {
  /** Now/Next 저작 순서 (이니셔티브 slug). ordering tiebreak. */
  order: string[];
  initiatives: { slug: string; status: string }[];
  /** `## Supersession 색인` 파싱 — supersede 체인 1차 소스. */
  supersessions: Supersession[];
}

// `N. <old> → **<new>** — [text](feature/ledger.md) (rest)`  — graceful(안 맞으면 skip)
const SUP_RE =
  /^\s*\d+\.\s+(.+?)\s*→\s*\*\*(.+?)\*\*\s*—\s*\[[^\]]*\]\(([^/)]+)\/ledger\.md\)\s*(?:\((.+)\))?\s*$/;

function supersessionSection(content: string): string {
  const m = content.match(/(?:^|\n)##[^\n]*[Ss]upersession[^\n]*\n([\s\S]*?)(?=\n##\s|$)/);
  return m?.[1] ?? "";
}

function parseSupersessions(content: string): Supersession[] {
  const out: Supersession[] = [];
  for (const line of supersessionSection(content).split("\n")) {
    const m = line.match(SUP_RE);
    if (!m?.[1] || !m[2] || !m[3]) continue; // graceful skip
    const rest = m[4] ?? "";
    const adr = [...rest.matchAll(/ADR-\d+/g)].map((x) => x[0]);
    out.push({ old: m[1].trim(), new: m[2].trim(), ledger: m[3], adr, note: rest.trim() });
  }
  return out;
}

export function parseIndex(content: string): IndexInfo {
  const order: string[] = [];
  for (const m of content.matchAll(/\*\*\[[^\]]+\]\(([^/)]+)\/ledger\.md\)\*\*/g)) {
    const slug = m[1];
    if (slug && !order.includes(slug)) order.push(slug);
  }
  const initiatives: { slug: string; status: string }[] = [];
  for (const m of content.matchAll(/\|\s*\[[^\]]+\]\(([^/)]+)\/ledger\.md\)\s*\|\s*([^|\s]+)/g)) {
    const slug = m[1];
    if (slug) initiatives.push({ slug, status: m[2] ?? "" });
  }
  return { order, initiatives, supersessions: parseSupersessions(content) };
}
