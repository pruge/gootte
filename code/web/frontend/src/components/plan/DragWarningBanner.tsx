import { IconAlertTriangle, IconX } from "@tabler/icons-react";
import type { DragWarning } from "@gootte/contract";

/**
 * 놓는 순간 뜨는 네 검사(spec 04 §놓는 순간) — 알려줄 뿐, 드래그를 막지 않는다.
 * 캡틴이 알면서 그대로 두는 것이 정당할 수 있다(예: 고장 수리를 먼저 한다) — 그래서 닫기만 있다.
 */
export function DragWarningBanner({ warnings, onDismiss }: { warnings: readonly DragWarning[]; onDismiss: () => void }) {
  if (warnings.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-partial/40 bg-partial/10 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="mono flex items-center gap-1.5 text-xs font-medium text-partial">
          <IconAlertTriangle size={14} /> 놓는 순간 알아챈 것 — 막지 않습니다, 그대로 두셔도 됩니다
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="닫기"
          className="rounded p-0.5 text-muted hover:bg-surface-2 hover:text-fg"
        >
          <IconX size={14} />
        </button>
      </div>
      <ul className="mono flex flex-col gap-0.5 pl-1 text-xs text-fg/80">
        {warnings.map((w, i) => (
          <li key={i}>{w.detail}</li>
        ))}
      </ul>
    </div>
  );
}
