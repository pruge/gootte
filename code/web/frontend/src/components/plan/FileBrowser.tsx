import { useState } from "react";
import {
  IconFolder,
  IconFileText,
  IconCornerLeftUp,
  IconChevronRight,
} from "@tabler/icons-react";
import type { DocRef, TreeNode } from "@gootte/contract";
import { useTree } from "../../lib/query";
import { Loading, ErrorMsg } from "../common/states";

interface FileBrowserProps {
  project: string;
  initiative: string;
  /** 파일 클릭 → DocRef 로 뷰어 열기. */
  onOpen: (ref: DocRef) => void;
}

/** 노드 path 의 부모 경로 ("adr/0001.md" → "adr", "spec.md" → ""). */
const parentOf = (p: string): string => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

/** dir 먼저 → 이름순. 서버 정렬(가상 todo/ 는 pending→done) 은 파일 내 유지. */
function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return 0; // 동종 = 서버 순서 보존(안정 정렬)
  });
}

/**
 * 이니셔티브 폴더 브라우저 — breadcrumb + 한 레벨 리스트(cd/ls, ADR-0002). 기본 진입 = 가상 `todo/`(ADR-0001).
 * dir 클릭 = 진입, `../`/breadcrumb = 상위, file 클릭 = onOpen(DocRef). read-path 결정적(서버 tree 릴레이).
 */
export function FileBrowser({ project, initiative, onOpen }: FileBrowserProps) {
  const { data, isLoading, isError, error } = useTree(project, initiative);
  const [path, setPath] = useState("todo"); // 기본 = 가상 todo 폴더

  if (isLoading) return <Loading label="문서 목록…" />;
  if (isError) return <ErrorMsg error={error} />;
  const nodes = data?.nodes ?? [];

  // 현재 path 존재 확인 — 없으면(빈 이니셔티브 등) 루트로 폴백.
  const exists = path === "" || nodes.some((n) => n.type === "dir" && n.path === path);
  const cur = exists ? path : "";
  const children = sortNodes(nodes.filter((n) => parentOf(n.path) === cur));
  const segments = cur ? cur.split("/") : [];

  return (
    <div className="px-3 py-3">
      {/* breadcrumb */}
      <nav aria-label="경로" className="mono mb-2 flex flex-wrap items-center gap-1 text-xs text-muted">
        <button
          type="button"
          onClick={() => setPath("")}
          className="rounded px-1 py-0.5 hover:bg-fg/[0.06] hover:text-fg"
        >
          {initiative}
        </button>
        {segments.map((seg, i) => {
          const to = segments.slice(0, i + 1).join("/");
          return (
            <span key={to} className="flex items-center gap-1">
              <IconChevronRight size={11} className="text-muted/60" />
              <button
                type="button"
                onClick={() => setPath(to)}
                className="rounded px-1 py-0.5 hover:bg-fg/[0.06] hover:text-fg"
              >
                {seg}
              </button>
            </span>
          );
        })}
      </nav>

      <ul className="space-y-0.5">
        {cur !== "" && (
          <li>
            <button
              type="button"
              onClick={() => setPath(parentOf(cur))}
              className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm text-muted transition-colors hover:bg-fg/[0.05] hover:text-fg"
            >
              <IconCornerLeftUp size={15} className="shrink-0" />
              <span className="mono">../</span>
            </button>
          </li>
        )}
        {children.length === 0 && cur === "" && (
          <li className="px-1.5 py-1 text-sm text-muted">문서가 없습니다.</li>
        )}
        {children.map((n) =>
          n.type === "dir" ? (
            <li key={n.path}>
              <button
                type="button"
                onClick={() => setPath(n.path)}
                className="group flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-base transition-colors hover:bg-fg/[0.05]"
              >
                <IconFolder size={16} className="shrink-0 text-accent" />
                <span className="mono truncate text-fg group-hover:text-accent">{n.name}/</span>
              </button>
            </li>
          ) : (
            <li key={n.path}>
              <button
                type="button"
                onClick={() => n.read && onOpen(n.read)}
                title="문서 보기"
                className="group flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-base transition-colors hover:bg-fg/[0.05]"
              >
                <IconFileText size={16} className="shrink-0 text-muted" />
                <span className="mono truncate text-fg group-hover:text-accent">{n.name}</span>
                {n.badge && (
                  <span className="mono ml-auto shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted">
                    {n.badge}
                  </span>
                )}
              </button>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
