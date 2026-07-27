import { useState } from "react";
import {
  IconCircleCheckFilled,
  IconProgress,
  IconCircleDashed,
  IconChevronRight,
} from "@tabler/icons-react";
import type { DocRef, RoadmapItem } from "@gootte/contract";
import { FileBrowser } from "./FileBrowser";

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
  project: string;
  item: RoadmapItem;
  /** 브라우저에서 파일 클릭 → DocRef 로 뷰어 열기. */
  onOpen: (ref: DocRef) => void;
}

/**
 * roadmap 한 줄 — 상태 배지 + 이니셔티브 + 진척(done/total). 클릭 시 **문서 브라우저** 펼침(2e).
 * 펼침 영역 = Unix 디렉토리형 FileBrowser(기본 = 가상 todo/ 폴더, 상위로 brief/spec/adr). 진척바 = done 비율(INV-4).
 */
export function RoadmapItemRow({ project, item, onOpen }: RoadmapItemRowProps) {
  const total = item.done.length + item.pending.length;
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
        {total > 0 && (
          <div
            className="pointer-events-none absolute inset-0 origin-left bg-accent/10 transition-transform duration-300"
            style={{ transform: `scaleX(${item.done.length / total})` }}
            aria-hidden
          />
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="relative flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-fg/[0.03]"
        >
          <meta.Icon size={18} className={`shrink-0 ${meta.tone}`} />
          <span className="font-medium tracking-tight">{item.initiative}</span>
          <span className="mono rounded bg-surface-2 px-1.5 py-0.5 text-sm text-muted">
            {meta.label}
          </span>
          {total > 0 && (
            <span className="mono ml-auto text-sm tabular-nums text-muted">
              {item.done.length}/{total}
            </span>
          )}
          <IconChevronRight
            size={15}
            className={`${total > 0 ? "" : "ml-auto"} shrink-0 text-muted transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          />
        </button>
      </div>

      {open && <FileBrowser project={project} initiative={item.initiative} onOpen={onOpen} />}
    </li>
  );
}
