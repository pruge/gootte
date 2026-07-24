import { frontmatter, str, arr } from "./frontmatter";

/** mermaid `M-NNNN` frontmatter → supersede 체인 정보. */
export interface MermaidInfo {
  id: string;
  title: string;
  status: string;
  supersedes: string[];
  supersededBy: string | null;
}

export function parseMermaid(content: string): MermaidInfo {
  const { data } = frontmatter(content);
  return {
    id: str(data.id) ?? "",
    title: str(data.title) ?? "",
    status: str(data.status) ?? "living",
    supersedes: arr(data.supersedes),
    supersededBy: str(data.superseded_by) ?? null,
  };
}
