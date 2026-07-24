import {
  IconAlertTriangle,
  IconFolder,
  IconFolderFilled,
  IconLoader2,
} from "@tabler/icons-react";
import { useProjects } from "../../lib/query";

interface SidebarProps {
  selected: string | null;
  onSelect: (slug: string) => void;
}

/** 자동발견 cling 프로젝트 목록. 선택 = URL `?p=<slug>`. Tabler 아이콘 전용. */
export function Sidebar({ selected, onSelect }: SidebarProps) {
  const { data, isLoading, isError, error } = useProjects();

  return (
    <nav
      aria-label="프로젝트"
      className="flex w-60 shrink-0 flex-col border-r border-border bg-surface"
    >
      <h2 className="mono px-4 pt-4 pb-2 text-[0.7rem] font-semibold tracking-[0.15em] text-muted">
        PROJECTS
      </h2>

      {isLoading && (
        <p className="flex items-center gap-2 px-4 py-2 text-sm text-muted">
          <IconLoader2 size={15} className="animate-spin" /> 발견 중…
        </p>
      )}

      {isError && (
        <p
          role="alert"
          className="mx-3 flex items-start gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-drop"
        >
          <IconAlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>{error instanceof Error ? error.message : "목록 로드 실패"}</span>
        </p>
      )}

      <ul className="flex-1 overflow-y-auto px-2 py-1">
        {data?.map((p) => {
          const active = p.slug === selected;
          const Icon = active ? IconFolderFilled : IconFolder;
          return (
            <li key={p.path}>
              <button
                type="button"
                aria-current={active ? "true" : undefined}
                onClick={() => onSelect(p.slug)}
                title={p.path}
                className={`group flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                  active
                    ? "bg-accent/12 text-fg"
                    : "text-muted hover:bg-surface-2 hover:text-fg"
                } focus-visible:outline-2 focus-visible:outline-accent`}
              >
                <Icon size={15} stroke={1.75} className={active ? "text-accent" : ""} />
                <span className="truncate">{p.slug}</span>
              </button>
            </li>
          );
        })}
        {data?.length === 0 && (
          <li className="px-2.5 py-2 text-sm text-muted">발견된 프로젝트 없음</li>
        )}
      </ul>

      <p className="mono border-t border-border px-4 py-2 text-[0.65rem] text-muted">
        자동 발견 · {data?.length ?? 0}개
      </p>
    </nav>
  );
}
