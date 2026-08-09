import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** 선두 YAML 프론트마터 제거(뷰 모드는 본문만 — 메타는 raw 모드에서). */
function stripFrontmatter(md: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(md);
  return m ? md.slice(m[0].length) : md;
}

/** md 렌더 뷰(GFM: 표·취소선·task-list). 무거운 라이브러리라 DocDrawer 가 lazy 로드. */
export function Markdown({ content }: { content: string }) {
  return (
    <div className="doc-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripFrontmatter(content)}</ReactMarkdown>
    </div>
  );
}
