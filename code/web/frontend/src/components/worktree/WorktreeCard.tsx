import { IconGitBranch, IconChevronRight, IconFileText } from "@tabler/icons-react";
import type { WorktreeStatus } from "@gootte/contract";

/** conflictRisk semantic 색 — low=중립 · med=partial(주의) · high=drop(경고). 서버 값 그대로(INV-4). */
const RISK: Record<"low" | "med" | "high", { label: string; cls: string }> = {
  low: { label: "충돌 낮음", cls: "bg-surface-2 text-muted" },
  med: { label: "충돌 중간", cls: "bg-partial/15 text-partial" },
  high: { label: "충돌 높음", cls: "bg-drop/15 text-drop" },
};

interface WorktreeCardProps {
  wt: WorktreeStatus;
  /** sprint 문서 열기 (sprint 있을 때만 클릭 가능) — worktree slug 로 그 트리의 라이브 버전을 읽음. */
  onOpen: (sprint: string, worktree: string) => void;
}

/** 활성 worktree 1개 — branch·initiative·sprint·conflictRisk. sprint 있으면 클릭 → 그 worktree 의 sprint 문서. */
export function WorktreeCard({ wt, onOpen }: WorktreeCardProps) {
  const risk = RISK[wt.signal.conflictRisk];
  const clickable = wt.sprint !== null;

  return (
    <li>
      <button
        type="button"
        disabled={!clickable}
        onClick={() => wt.sprint && onOpen(wt.sprint, wt.slug)}
        className={`flex w-full flex-col gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-left transition-colors ${
          clickable ? "hover:border-muted/40 hover:bg-fg/[0.02]" : "cursor-default"
        }`}
      >
        <div className="flex items-center gap-2">
          <IconGitBranch size={16} className="shrink-0 text-accent" />
          <span className="mono min-w-0 flex-1 truncate text-sm font-medium">{wt.slug}</span>
          <span className={`mono shrink-0 rounded px-1.5 py-0.5 text-xs ${risk.cls}`}>
            {risk.label}
          </span>
          {clickable && <IconChevronRight size={15} className="shrink-0 text-muted" />}
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 pl-6 text-base">
          {wt.initiative && (
            <>
              <dt className="text-muted">이니셔티브</dt>
              <dd className="truncate">{wt.initiative}</dd>
            </>
          )}
          <dt className="text-muted">sprint</dt>
          <dd className="min-w-0 truncate">
            {wt.sprint ? (
              <span className="inline-flex items-center gap-1 text-accent">
                <IconFileText size={13} /> {wt.sprint}
              </span>
            ) : (
              <span className="text-muted">—</span>
            )}
          </dd>
          <dt className="text-muted">branch</dt>
          <dd className="mono truncate text-muted">{wt.branch}</dd>
        </dl>

        <p className="mono pl-6 text-sm text-muted">
          main +{wt.signal.mainCommitsSince} · overlap {wt.signal.overlapFiles.length}
        </p>
      </button>
    </li>
  );
}
