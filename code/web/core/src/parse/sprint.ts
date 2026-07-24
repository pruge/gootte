import { Sprint } from "@gootte/contract";
import { frontmatter, arr } from "./frontmatter";

/** sprint `.md` frontmatter → Sprint. worktree↔todos 매핑의 근원(state 가 소비). */
export function parseSprint(slug: string, content: string): Sprint {
  const { data } = frontmatter(content);
  return Sprint.parse({
    slug,
    status: data.status,
    todos: arr(data.todos),
    worktree: data.worktree ?? null,
  });
}
