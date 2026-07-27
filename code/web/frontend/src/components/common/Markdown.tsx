import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MermaidBlock } from "./MermaidBlock";

type Segment = { type: "md" | "mermaid"; text: string };

/** 선두 YAML 프론트마터 제거(뷰 모드는 본문만 — 메타는 raw 모드에서). */
function stripFrontmatter(md: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(md);
  return m ? md.slice(m[0].length) : md;
}

/** ```mermaid 펜스를 세그먼트로 분리 — mermaid 는 전용 렌더, 나머지는 react-markdown. */
function splitMermaid(md: string): Segment[] {
  const re = /```mermaid[ \t]*\r?\n([\s\S]*?)```/g;
  const out: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    if (m.index > last) out.push({ type: "md", text: md.slice(last, m.index) });
    out.push({ type: "mermaid", text: (m[1] ?? "").trim() });
    last = m.index + m[0].length;
  }
  if (last < md.length) out.push({ type: "md", text: md.slice(last) });
  return out.length > 0 ? out : [{ type: "md", text: md }];
}

/** md 렌더 뷰(GFM: 표·취소선·task-list) + mermaid 다이어그램. 무거운 라이브러리라 DocDrawer 가 lazy 로드. */
export function Markdown({ content }: { content: string }) {
  const segments = splitMermaid(stripFrontmatter(content));
  return (
    <div className="doc-md">
      {segments.map((seg, i) =>
        seg.type === "mermaid" ? (
          <MermaidBlock key={i} code={seg.text} />
        ) : seg.text.trim() ? (
          <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
            {seg.text}
          </ReactMarkdown>
        ) : null,
      )}
    </div>
  );
}
