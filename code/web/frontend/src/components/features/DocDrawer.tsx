import { useEffect, useRef } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { IconX } from "@tabler/icons-react";
import { useFeatureDoc } from "../../lib/query";
import { Loading, ErrorMsg } from "../common/states";

/**
 * 마크다운 → 화면 서식(제목·목록·표·코드블록·링크). `remark-gfm` 은 표(GFM) 때문에 필요하다 —
 * 사양 문서 자체가 표를 쓴다. mermaid 등 다이어그램 렌더러는 붙이지 않는다 —
 * 코드블록은 언어가 무엇이든 그대로 코드블록으로 남는다(티켓 01 §설계 4, 다이어그램 되살리지 않음).
 * react-markdown 은 기본적으로 raw HTML 을 실행하지 않는다(rehype-raw 를 안 넣었다) — XSS 방어.
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

interface DocDrawerProps {
  project: string;
  featureSlug: string | null;
  path: string | null;
  onClose: () => void;
}

/**
 * 우측 드로어 — 트리에서 문서를 누르면 뜬다(티켓 01 §설계 4). ESC 로 닫는다.
 * 포커스 복귀는 여기서 하지 않는다 — 무엇이 열었는지는 이 컴포넌트가 모른다(FeaturesView 가 안다).
 */
export function DocDrawer({ project, featureSlug, path, onClose }: DocDrawerProps) {
  const open = featureSlug !== null && path !== null;
  const { data, isLoading, isError, error } = useFeatureDoc(project, featureSlug, path);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="드로어 닫기"
        className="absolute inset-0 bg-fg/20 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={path ?? "문서"}
        tabIndex={-1}
        className="relative flex h-full w-[560px] max-w-[92vw] flex-col border-l border-border bg-surface shadow-xl outline-none"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <span
            className="mono min-w-0 truncate text-sm text-muted"
            title={`${featureSlug}/${path}`}
          >
            {featureSlug}/{path}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="shrink-0 rounded p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
          >
            <IconX size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading && <Loading label="문서 읽는 중…" />}
          {isError && <ErrorMsg error={error} />}
          {data && (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
              {data.content}
            </ReactMarkdown>
          )}
        </div>
      </div>
    </div>
  );
}
