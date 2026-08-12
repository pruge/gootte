import { useState, type MouseEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IconArrowMoveRight, IconFileText } from "@tabler/icons-react";
import type { PlanCard } from "@gootte/contract";
import { featureDescription } from "./cardTitle";

export interface BoardCardProps {
  card: PlanCard;
  /** 여러 장 고르기 — 고른 카드는 테두리로 드러나고, 그중 하나를 끌면 전부 따라간다. */
  selected?: boolean;
  /** 머리글을 ⌘/Ctrl/Shift 와 함께 누른 것 — 펼치는 대신 고른다. */
  onToggleSelect?: (slug: string) => void;
  /** 문서 아이콘 — `features` 탭의 기존 통로로 간다(두 번째 문서 보기를 짓지 않는다). */
  onOpenDoc?: (slug: string) => void;
  /** 이동 아이콘 — "어느 칸으로 보낼까요" 대화상자. */
  onRequestMove?: (slug: string) => void;
  /** 끌기 오버레이용 사본 — 끌기 배선 없이 모양만 그린다. */
  overlay?: boolean;
}

/**
 * 판 위의 카드 하나 — **기본은 머리만 보이게 접혀 있고, 눌러야 티켓 줄이 펼쳐진다**(캡틴 결정).
 * 접힘은 **화면의 상태**이지 저장하지 않는다(spec §완료 카드는 접혀 있다).
 *
 * 🔴 여기 보이는 것은 전부 **문서에서 온 것**이다(INV-5) — 제목도, 티켓 번호·제목·상태도.
 * 계획 DB 가 아는 것은 이 카드가 어느 칸에 있는가와 그 순서뿐이라, 둘이 갈라질 수 없다.
 *
 * 🔴 접힌 카드도 **티켓 수는 머리에 이고 있다** — 감추면 카드가 제 크기를 말하지 않게 되고,
 * 캡틴이 판을 훑는 동안 하나하나 열어 봐야 한다.
 *
 * 머리글 토글은 `<button>` **하나**이고, 아이콘 둘은 그 버튼 **안**이 아니라 **옆(형제)** 에 선다 —
 * 버튼 안의 버튼은 무효 HTML 이다(features 탭 `FeatureCard` 와 같은 규율).
 *
 * 끌기는 카드 전체가 손잡이다(03). 6px 움직여야 끌기로 치므로 머리글 토글과 아이콘 둘은 그대로
 * 눌린다 — 따로 손잡이 아이콘을 세우지 않는다(캡틴이 정한 아이콘은 둘뿐이다).
 * 체크상자·자동 완료는 04 다.
 */
export function BoardCard({
  card,
  selected = false,
  onToggleSelect,
  onOpenDoc,
  onRequestMove,
  overlay = false,
}: BoardCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { feature } = card;
  const headingId = `board-card-${feature.slug}`;
  // 표제 앞에 겹쳐 붙은 기능 이름은 뗀다 — 같은 이름이 한 카드에 두 번 뜨지 않게(캡틴 결정).
  const description = featureDescription(feature.title, feature.slug);

  // 🔴 `role` 을 카드 자신의 것으로 못 박는다 — dnd-kit 기본값(`button`)이 붙으면 카드가
  // 카드가 아니게 되고, 안에 있는 머리글 버튼이 버튼 속 버튼이 된다.
  const sortable = useSortable({
    id: feature.slug,
    disabled: overlay,
    attributes: { role: "article", roleDescription: "카드 — 끌어서 다른 칸으로 옮깁니다" },
  });

  const onHeaderClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (onToggleSelect && (e.metaKey || e.ctrlKey || e.shiftKey)) {
      onToggleSelect(feature.slug);
      return;
    }
    setExpanded((v) => !v);
  };

  return (
    <article
      {...(overlay ? {} : sortable.attributes)}
      {...(overlay ? {} : sortable.listeners)}
      ref={overlay ? undefined : sortable.setNodeRef}
      style={
        overlay
          ? undefined
          : { transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }
      }
      aria-labelledby={headingId}
      data-selected={selected || undefined}
      className={`touch-none overflow-hidden rounded-md border bg-bg focus-visible:outline-2 focus-visible:outline-accent ${
        selected ? "border-accent ring-1 ring-accent/40" : "border-border"
      } ${overlay ? "cursor-grabbing shadow-xl" : "cursor-grab"} ${
        sortable.isDragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex w-full items-stretch bg-surface-2/50">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={onHeaderClick}
          className="grid min-w-0 flex-1 cursor-[inherit] grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-0.5 px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-accent"
        >
          {/* 두 줄 — 첫 줄 기능 이름, 둘째 줄 설명문구(캡틴 결정). 설명이 없는 기능(표제가 곧
              폴더명인 경우)은 이름 한 줄만 그린다 — 빈 줄로 자리를 채우지 않는다.
              🔴 곁다리(닫힌 시각·티켓 수)는 **첫 줄 옆**에만 선다. 두 줄 묶음 전체의 옆에 두면
              짧은 이름 줄이 남기는 여백까지 설명 줄에서 빼앗아 설명이 카드 폭을 다 못 쓰고 잘린다.
              그래서 자리를 격자로 못 박는다 — 이름과 곁다리가 첫 줄을 나눠 쓰고, **설명은 둘째 줄을
              통째로** 갖는다. 제목(`h3`)은 `contents` 라 이름과 설명만 묶어 카드 이름이 되고,
              곁다리는 그 이름에 섞이지 않는다. */}
          <h3 id={headingId} className="contents">
            <span
              className={`mono col-start-1 row-start-1 min-w-0 truncate ${
                description ? "text-sm text-muted" : "font-medium tracking-tight"
              }`}
            >
              {feature.slug}
            </span>
            {/* 🔴 설명은 잘리지 않는다 — 폭이 모자라면 다음 줄로 넘어간다. 말줄임은 문구를
                감추는 것이고, 카드가 무엇에 대한 것인지는 감출 값이 아니다. */}
            {description && (
              <span className="col-span-2 col-start-1 row-start-2 font-medium tracking-tight break-words">
                {description}
              </span>
            )}
          </h3>
          <span className="col-start-2 row-start-1 flex shrink-0 items-baseline gap-x-2.5">
            {/* 닫힌 시각은 문서에 없는 값이라 계획 DB 가 갖는다(INV-5 · F6) — 있을 때만 뜬다. */}
            {card.closedAt && (
              <span className="mono text-sm tabular-nums text-muted">{card.closedAt}</span>
            )}
            <span className="mono text-sm tabular-nums text-muted">
              티켓 {feature.tickets.length}
            </span>
          </span>
        </button>

        {/* 🔴 아이콘 **둘** — 캡틴 제안 9. 머리글 버튼의 형제이고, 끌기가 시작되지 않도록
            pointerdown 을 여기서 멈춘다(누르려던 아이콘이 끌기로 새지 않게). */}
        {!overlay && (
          <div
            className="flex shrink-0 items-center gap-0.5 pr-1.5"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => onOpenDoc?.(feature.slug)}
              aria-label={`${feature.slug} 문서 열기`}
              title="features 탭에서 이 기능 문서를 연다"
              className="cursor-pointer rounded p-1.5 text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              <IconFileText size={17} stroke={1.6} />
            </button>
            <button
              type="button"
              onClick={() => onRequestMove?.(feature.slug)}
              aria-label={`${feature.slug} 다른 칸으로 보내기`}
              title="어느 칸으로 보낼지 고른다"
              className="cursor-pointer rounded p-1.5 text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              <IconArrowMoveRight size={17} stroke={1.6} />
            </button>
          </div>
        )}
      </div>

      {expanded &&
        (feature.tickets.length === 0 ? (
          // 티켓이 없는 기능도 감추지 않는다 — 열었는데 빈 칸이면 화면이 이유를 말해야 한다.
          <p className="border-t border-border/70 px-3 py-2 text-sm text-muted">
            티켓이 없습니다.
          </p>
        ) : (
          <ul className="divide-y divide-border/50 border-t border-border/70">
            {feature.tickets.map((t) => (
              <li
                key={t.slug}
                className={`flex flex-wrap items-baseline gap-x-2.5 gap-y-1 px-3 py-1.5 ${
                  t.status === "done" || t.status === "dropped" ? "text-muted" : ""
                }`}
              >
                <span className="mono shrink-0 text-sm tabular-nums text-muted">{t.num || "—"}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                {/* 원문 상태를 뭉개지 않고 그대로 릴레이한다(INV-4). 정규 값이 아니면 눈에 띄게. */}
                <span
                  className={`mono shrink-0 rounded px-1.5 py-0.5 text-sm ${
                    t.statusKnown ? "bg-surface-2 text-muted" : "bg-drop/15 text-drop"
                  }`}
                >
                  {t.sourceStatus ?? "상태 줄 없음"}
                </span>
              </li>
            ))}
          </ul>
        ))}
    </article>
  );
}
