export interface ViewModeOption {
  id: string;
  label: string;
}

interface ViewModeProps {
  options: ViewModeOption[];
  value: string;
  onChange: (id: string) => void;
}

/** 뷰모드 세그먼트 토글 (탭 안의 표현 전환 — plan: 리스트/보드/타임라인 등). */
export function ViewMode({ options, value, onChange }: ViewModeProps) {
  return (
    <div role="tablist" aria-label="뷰모드" className="flex gap-0.5 rounded-md bg-surface-2 p-0.5">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={`mono rounded px-2.5 py-0.5 text-sm transition-colors ${
              active ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"
            } focus-visible:outline-2 focus-visible:outline-accent`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
