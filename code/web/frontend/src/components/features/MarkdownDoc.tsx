import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * 마크다운 → 화면 서식(제목·목록·표·코드블록·링크). `remark-gfm` 은 표(GFM) 때문에 필요하다 —
 * 사양 문서 자체가 표를 쓴다. mermaid 등 다이어그램 렌더러는 붙이지 않는다 —
 * 코드블록은 언어가 무엇이든 그대로 코드블록으로 남는다(티켓 01 §설계 4, 다이어그램 되살리지 않음).
 * react-markdown 은 기본적으로 raw HTML 을 실행하지 않는다(rehype-raw 를 안 넣었다) — XSS 방어.
 *
 * 🔴 별도 모듈로 뗀 이유 — react-markdown + remark-gfm(+ micromark)는 초기 청크의 가장 큰
 * 덩어리(≈149kB)인데 문서를 실제로 열 때만 필요하다. `DocDrawer` 가 이 컴포넌트를 lazy 로 불러
 * 문서 뷰어가 열리는 순간에만 이 청크를 받는다.
 */
const MD_COMPONENTS: Components = {
  h1: ({ node: _node, ...rest }) => (
    <h1 className="mb-3 mt-6 text-2xl font-semibold tracking-tight first:mt-0" {...rest} />
  ),
  h2: ({ node: _node, ...rest }) => (
    <h2 className="mb-2 mt-6 text-xl font-semibold tracking-tight" {...rest} />
  ),
  h3: ({ node: _node, ...rest }) => (
    <h3 className="mb-2 mt-5 text-lg font-medium tracking-tight" {...rest} />
  ),
  p: ({ node: _node, ...rest }) => <p className="mb-3 leading-relaxed text-fg" {...rest} />,
  ul: ({ node: _node, ...rest }) => <ul className="mb-3 list-disc space-y-1 pl-5" {...rest} />,
  ol: ({ node: _node, ...rest }) => <ol className="mb-3 list-decimal space-y-1 pl-5" {...rest} />,
  li: ({ node: _node, ...rest }) => <li className="leading-relaxed" {...rest} />,
  a: ({ node: _node, ...rest }) => (
    <a className="text-accent underline underline-offset-2" target="_blank" rel="noreferrer" {...rest} />
  ),
  blockquote: ({ node: _node, ...rest }) => (
    <blockquote className="mb-3 border-l-2 border-border pl-3 text-muted" {...rest} />
  ),
  code: ({ node: _node, className, children, ...rest }) => {
    const isBlock = typeof className === "string" && className.startsWith("language-");
    return isBlock ? (
      <code className={`mono ${className}`} {...rest}>
        {children}
      </code>
    ) : (
      <code className="mono rounded bg-surface-2 px-1 py-0.5 text-[0.9em]" {...rest}>
        {children}
      </code>
    );
  },
  pre: ({ node: _node, ...rest }) => (
    <pre className="mb-3 overflow-x-auto rounded-lg bg-surface-2 p-3 text-sm" {...rest} />
  ),
  table: ({ node: _node, ...rest }) => (
    <div className="mb-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...rest} />
    </div>
  ),
  thead: ({ node: _node, ...rest }) => <thead className="border-b border-border text-left" {...rest} />,
  th: ({ node: _node, ...rest }) => <th className="px-2 py-1.5 font-medium text-muted" {...rest} />,
  td: ({ node: _node, ...rest }) => (
    <td className="border-t border-border/60 px-2 py-1.5 align-top" {...rest} />
  ),
  hr: () => <hr className="my-4 border-border" />,
};

export default function MarkdownDoc({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
      {content}
    </ReactMarkdown>
  );
}
