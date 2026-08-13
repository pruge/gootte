import type { Tab } from "../../hooks/useUrlState";

const TABS: { id: Tab; label: string }[] = [
  { id: "features", label: "features" },
  { id: "plan", label: "plan" },
  { id: "process", label: "steps" },
];

interface TabsProps {
  tab: Tab;
  onTab: (t: Tab) => void;
}

export function Tabs({ tab, onTab }: TabsProps) {
  return (
    <div role="tablist" aria-label="뷰" className="flex gap-1 rounded-lg bg-surface-2 p-1">
      {TABS.map((t) => {
        const active = t.id === tab;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onTab(t.id)}
            className={`mono rounded-md px-3 py-1 text-sm transition-colors ${
              active
                ? "bg-surface text-fg shadow-sm"
                : "text-muted hover:text-fg"
            } focus-visible:outline-2 focus-visible:outline-accent`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
