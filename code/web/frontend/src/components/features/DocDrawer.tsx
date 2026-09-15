import { Suspense, lazy, useEffect, useRef } from "react";
import { IconX } from "@tabler/icons-react";
import { useFeatureDoc } from "../../lib/query";
import { Loading, ErrorMsg } from "../common/states";

// react-markdown + remark-gfm(+micromark)는 초기 청크의 가장 큰 덩어리라 문서를 열 때만 받는다.
const MarkdownDoc = lazy(() => import("./MarkdownDoc"));

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
        className="relative flex h-full w-[min(920px,60vw)] max-w-[96vw] flex-col border-l border-border bg-surface shadow-xl outline-none"
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
            <Suspense fallback={<Loading label="문서 읽는 중…" />}>
              <MarkdownDoc content={data.content} />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}
