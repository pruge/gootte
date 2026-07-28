import { frontmatter, str, arr } from "./frontmatter";

/** mermaid `M-NNNN` frontmatter → supersede 체인 정보 + sources(track 파생용). */
export interface MermaidInfo {
  id: string;
  title: string;
  status: string;
  supersedes: string[];
  supersededBy: string | null;
  sources: string[];
}

export function parseMermaid(content: string): MermaidInfo {
  const { data } = frontmatter(content);
  return {
    id: str(data.id) ?? "",
    title: str(data.title) ?? "",
    status: str(data.status) ?? "living",
    supersedes: arr(data.supersedes),
    supersededBy: str(data.superseded_by) ?? null,
    sources: arr(data.sources),
  };
}

/** 본문에서 첫 ` ```mermaid ` 코드 블록 추출(없으면 null). 순수·결정적. */
export function extractMermaidBlock(body: string): string | null {
  const m = body.match(/```mermaid[^\n]*\n([\s\S]*?)```/);
  return m ? m[1]!.replace(/\s+$/, "") : null;
}
