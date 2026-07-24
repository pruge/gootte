/** roadmap `INDEX.md` → Now/Next 순서 + 이니셔티브 표(롤업 상태). */
export interface IndexInfo {
  /** Now/Next 저작 순서 (이니셔티브 slug). ordering tiebreak 에 사용. */
  order: string[];
  initiatives: { slug: string; status: string }[];
}

export function parseIndex(content: string): IndexInfo {
  const order: string[] = [];
  // Now/Next 헤더: `N. **[<feature>](<feature>/ledger.md)** 🔜`
  for (const m of content.matchAll(/\*\*\[[^\]]+\]\(([^/)]+)\/ledger\.md\)\*\*/g)) {
    const slug = m[1];
    if (slug && !order.includes(slug)) order.push(slug);
  }
  // 이니셔티브 표 행: `| [name](feature/ledger.md) | 🔜 | ...`
  const initiatives: { slug: string; status: string }[] = [];
  for (const m of content.matchAll(/\|\s*\[[^\]]+\]\(([^/)]+)\/ledger\.md\)\s*\|\s*([^|\s]+)/g)) {
    const slug = m[1];
    if (slug) initiatives.push({ slug, status: m[2] ?? "" });
  }
  return { order, initiatives };
}
