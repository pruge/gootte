import { useState } from "react";
import {
  IconCircleCheckFilled,
  IconProgress,
  IconCircleDashed,
  IconSquareCheckFilled,
  IconSquare,
  IconChevronRight,
} from "@tabler/icons-react";
import type { RoadmapItem } from "@gootte/contract";

/** 상태별 표기 — semantic 색(장식 아님): 진행/완료 = accent, 예정 = muted. */
const STATUS_META: Record<
  RoadmapItem["status"],
  { label: string; Icon: typeof IconProgress; tone: string }
> = {
  active: { label: "진행", Icon: IconProgress, tone: "text-accent" },
  planned: { label: "예정", Icon: IconCircleDashed, tone: "text-muted" },
  shipped: { label: "완료", Icon: IconCircleCheckFilled, tone: "text-accent" },
  superseded: { label: "폐기", Icon: IconCircleDashed, tone: "text-muted" }, // 방어(서버 미방출)
};

interface RoadmapItemRowProps {
  item: RoadmapItem;
  /** 할일(todo slug) 클릭 → 그 문서 뷰어 열기. */
  onOpenDoc: (name: string) => void;
}

/**
 * roadmap 한 줄 — 상태 배지 + 이니셔티브 + 진척(done/total). 클릭 시 할일 체크리스트 펼침.
 * 한일 ☑(line-through) / 남은일 ☐, 각 할일 클릭 → 문서. 서버 done/pending 값 그대로(INV-4).
 */
export function RoadmapItemRow({ item, onOpenDoc }: RoadmapItemRowProps) {
  const total = item.done.length + item.pending.length;
  const hasChecklist = total > 0;
  const [open, setOpen] = useState(false);
  const meta = STATUS_META[item.status];

  const card =
    item.status === "active"
      ? "border-accent/40 bg-accent/5"
      : item.status === "shipped"
        ? "border-border bg-surface-2/40"
        : "border-border bg-surface";

  return (
    <li className={`overflow-hidden rounded-lg border transition-colors ${card}`}>
      <div className="relative">
        {/* 진행바 = 진척(done 비율)만큼 옅게 채운 배경 fill — 콘텐츠 뒤(눈부심 X). */}
        {hasChecklist && (
          <div
            className="pointer-events-none absolute inset-0 origin-left bg-accent/10 transition-transform duration-300"
            style={{ transform: `scaleX(${item.done.length / total})` }}
            aria-hidden
          />
        )}
        <button
          type="button"
          onClick={() => hasChecklist && setOpen((o) => !o)}
          aria-expanded={hasChecklist ? open : undefined}
          disabled={!hasChecklist}
          className="relative flex w-full items-center gap-2.5 px-4 py-3 text-left enabled:hover:bg-fg/[0.03] disabled:cursor-default"
        >
          <meta.Icon size={18} className={`shrink-0 ${meta.tone}`} />
          <span className="font-medium tracking-tight">{item.initiative}</span>
          <span className="mono rounded bg-surface-2 px-1.5 py-0.5 text-sm text-muted">
            {meta.label}
          </span>
          {hasChecklist && (
            <>
              <span className="mono ml-auto text-sm tabular-nums text-muted">
                {item.done.length}/{total}
              </span>
              <IconChevronRight
                size={15}
                className={`shrink-0 text-muted transition-transform duration-200 ${open ? "rotate-90" : ""}`}
              />
            </>
          )}
        </button>
      </div>

      {open && hasChecklist && (
        <ul className="space-y-0.5 px-3 py-3">
          {item.done.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => onOpenDoc(s)}
                title="문서 보기"
                className="group flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-base transition-colors hover:bg-fg/[0.05]"
              >
                <IconSquareCheckFilled size={16} className="shrink-0 text-accent" />
                <span className="truncate text-muted line-through group-hover:text-fg">{s}</span>
              </button>
            </li>
          ))}
          {item.pending.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => onOpenDoc(s)}
                title="문서 보기"
                className="group flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-base transition-colors hover:bg-fg/[0.05]"
              >
                <IconSquare size={16} className="shrink-0 text-muted" />
                <span className="truncate text-fg group-hover:text-accent">{s}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
