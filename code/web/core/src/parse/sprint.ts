import { Sprint } from "@gootte/contract";
import { frontmatter, arr, dstr } from "./frontmatter";

const date = (v: unknown): string | undefined => (v == null ? undefined : dstr(v));

/** sprint `.md` frontmatter → Sprint. worktree↔todos 매핑의 근원(state 가 소비). 날짜 = Gantt 소스(2c). */
export function parseSprint(slug: string, content: string): Sprint {
  const { data } = frontmatter(content);
  return Sprint.parse({
    slug,
    status: data.status,
    todos: arr(data.todos),
    worktree: data.worktree ?? null,
    created: date(data.created),
    startedAt: date(data.startedAt),
    endedAt: date(data.endedAt),
  });
}
