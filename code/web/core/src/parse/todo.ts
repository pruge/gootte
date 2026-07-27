import { TodoItem } from "@gootte/contract";
import { frontmatter, dstr } from "./frontmatter";

/** todo `.md` frontmatter → TodoItem. slug = 파일명 유래(호출자가 준다). */
export function parseTodo(slug: string, content: string): TodoItem {
  const { data } = frontmatter(content);
  return TodoItem.parse({
    slug,
    status: data.status,
    priority: data.priority ?? "normal",
    initiative: data.initiative ?? null,
    created: dstr(data.created),
    completedAt: data.completedAt ? dstr(data.completedAt) : undefined,
    resolvedBy: typeof data.resolvedBy === "string" ? data.resolvedBy : undefined,
    source: typeof data.source === "string" ? data.source : undefined,
    related: Array.isArray(data.related) ? data.related.map((r) => String(r)) : undefined,
  });
}
