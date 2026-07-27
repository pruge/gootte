import { lazy, Suspense, useEffect, useState } from "react";
import { IconX, IconFileText } from "@tabler/icons-react";
import type { DocRef } from "@gootte/contract";
import { useDocRef } from "../../lib/query";
import { Loading, ErrorMsg } from "../common/states";
import { ViewMode, type ViewModeOption } from "../main/ViewMode";

// 무거운 md/mermaid 라이브러리는 뷰 모드 진입 시에만 로드(코드 스플릿, perf).
const Markdown = lazy(() =>
  import("../common/Markdown").then((m) => ({ default: m.Markdown })),
);

interface DocDrawerProps {
  project: string;
  docRef: DocRef;
  /** todo/sprint 소스일 때 그 worktree 트리에서 읽음 (활성 sprint 의 미커밋 라이브 버전). */
  worktree?: string;
  onClose: () => void;
}

const MODES: ViewModeOption[] = [
  { id: "view", label: "보기" },
  { id: "raw", label: "raw" },
];

const refTitle = (ref: DocRef): string => (ref.source === "roadmap" ? ref.relPath : ref.name);

/** 문서 뷰어 — 우측 슬라이드오버. DocRef(roadmap/todo/sprint) 소스 분기 read. 보기/raw 토글. ESC·백드롭·X 닫음. */
export function DocDrawer({ project, docRef, worktree, onClose }: DocDrawerProps) {
  const { data, isLoading, isError, error } = useDocRef(project, docRef, worktree);
  const [mode, setMode] = useState<"view" | "raw">("view");
  const name = refTitle(docRef);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-20 flex justify-end">
      <button aria-label="닫기" className="absolute inset-0 bg-fg/20" onClick={onClose} />
      <aside
        role="dialog"
        aria-label={`문서 ${name}`}
        className="relative flex h-full w-full max-w-2xl flex-col border-l border-border bg-surface shadow-2xl"
      >
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <IconFileText size={16} className="shrink-0 text-accent" />
          <span className="mono min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
          {data?.worktree && (
            <span className="mono rounded bg-accent/15 px-1.5 py-0.5 text-xs text-accent">worktree</span>
          )}
          {data?.archived && (
            <span className="mono rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted">archive</span>
          )}
          <ViewMode options={MODES} value={mode} onChange={(v) => setMode(v as "view" | "raw")} />
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded p-1 text-muted transition-colors hover:bg-fg/[0.06] hover:text-fg"
          >
            <IconX size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <Loading label="문서 로드 중…" />
          ) : isError ? (
            <ErrorMsg error={error} />
          ) : mode === "raw" ? (
            <pre className="mono whitespace-pre-wrap break-words text-sm leading-relaxed text-fg">
              {data?.content}
            </pre>
          ) : (
            <Suspense fallback={<Loading label="렌더 중…" />}>
              <Markdown content={data?.content ?? ""} />
            </Suspense>
          )}
        </div>
      </aside>
    </div>
  );
}
