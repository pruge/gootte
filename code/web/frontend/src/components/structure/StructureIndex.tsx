import type { StructureGroup } from "@gootte/contract";

interface StructureIndexProps {
  groups: StructureGroup[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** 좌측 track 인덱스 — 그룹(시스템/공통 → track) 헤더 + 다이어그램 항목. 리스트 사이드바와 동축. */
export function StructureIndex({ groups, selectedId, onSelect }: StructureIndexProps) {
  return (
    <nav
      aria-label="구조 다이어그램"
      className="w-64 shrink-0 space-y-4 overflow-y-auto border-r border-border pr-3"
    >
      {groups.map((g) => (
        <section key={g.track?.key ?? "__system__"}>
          <h3 className="mono mb-1 flex items-baseline gap-1.5 px-1 text-xs tracking-[0.1em] text-muted">
            {g.track ? (
              <>
                <span className="font-semibold text-accent">{g.track.key}</span>
                <span className="truncate">{g.track.label}</span>
              </>
            ) : (
              <span className="truncate">시스템 / 공통</span>
            )}
          </h3>
          <ul className="space-y-0.5">
            {g.diagrams.map((d) => {
              const on = d.id === selectedId;
              const superseded = d.status === "superseded";
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(d.id)}
                    aria-current={on ? "true" : undefined}
                    className={`flex w-full items-baseline gap-1.5 rounded-md border px-2 py-1.5 text-left transition-colors ${
                      on ? "border-accent/50 bg-accent/5" : "border-transparent hover:bg-fg/[0.03]"
                    } ${superseded ? "opacity-60" : ""}`}
                  >
                    <span className="mono shrink-0 text-xs text-muted">{d.id}</span>
                    <span
                      className={`truncate text-sm tracking-tight ${on ? "text-fg" : "text-muted"}`}
                    >
                      {d.title}
                    </span>
                    {superseded && <span className="ml-auto shrink-0 text-xs text-muted">⚫</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}
