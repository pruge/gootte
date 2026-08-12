import { useDroppable } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { IconInbox } from "@tabler/icons-react";
import type { PlanCard } from "@gootte/contract";
import { BoardCard } from "./BoardCard";
import { AREA_DROP_ID, AREA_LABEL, type BoardAreaId } from "./areas";

interface CardListProps {
  areaId: BoardAreaId;
  cards: readonly PlanCard[];
  empty: string;
  selected: ReadonlySet<string>;
  /** 지금 끌고 있는 카드가 이 칸으로 향하고 있다 — 칸 **전체**가 그렇다고 말한다. */
  highlighted?: boolean;
  onToggleSelect: (areaId: BoardAreaId, slug: string) => void;
  onOpenDoc: (slug: string) => void;
  onRequestMove: (areaId: BoardAreaId, slug: string) => void;
}

/**
 * 칸 하나의 카드 목록이자 **놓을 자리**다.
 *
 * 🔴 **칸의 넓이 전체가 놓을 자리다**(캡틴 지시) — 카드가 놓인 윗부분만이 아니라 아래 빈 자리까지
 * 같은 칸이다. 그래서 이 요소는 머리글을 뺀 칸을 **가득 채우고**(`h-full`), 판정도 포인터가
 * 이 안에 들어왔는가로 한다(`PlanView` 의 `collideByPointer`).
 *
 * 🔴 강조도 칸 **전체**에 준다 — 포인터가 카드 위에 있든 빈 자리에 있든, 지금 향하고 있는 칸
 * 하나가 통째로 밝아진다. 포인터 밑의 좁은 띠만 밝히면 화면이 "여기만 놓을 수 있다" 고 거짓말한다.
 *
 * 🔴 빈 칸도 놓을 자리다 — 비어 있다고 droppable 을 접으면 첫 카드를 그 칸에 넣을 방법이 없어진다.
 *
 * 칸 수는 **화면 폭이 아니라 이 칸의 폭**이 정한다(`@container`) — 판은 사이드바 옆에 있어
 * 창 크기와 칸 폭이 같지 않다. 뷰포트로 재면 사이드바를 접었을 때 칸이 넓어져도 그대로 있다.
 * 접힌 카드는 높이가 같아 줄이 가지런하고, 하나를 펼쳐도 `items-start` 라 옆 카드가 늘어나지 않는다.
 */
export function CardList({
  areaId,
  cards,
  empty,
  selected,
  highlighted = false,
  onToggleSelect,
  onOpenDoc,
  onRequestMove,
}: CardListProps) {
  const { setNodeRef } = useDroppable({ id: AREA_DROP_ID(areaId) });

  return (
    <div
      ref={setNodeRef}
      data-drop-area={areaId}
      data-drop-over={highlighted || undefined}
      aria-label={`${AREA_LABEL[areaId]} 칸`}
      className={`@container h-full overflow-y-auto p-[var(--plan-list-pad)] transition-colors ${
        highlighted ? "bg-accent/10 ring-2 ring-inset ring-accent/50" : ""
      }`}
    >
      {cards.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-muted">
          <IconInbox size={26} stroke={1.25} />
          <p className="text-sm">{empty}</p>
        </div>
      ) : (
        <SortableContext items={cards.map((c) => c.feature.slug)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 items-start gap-[var(--plan-card-gap)] @2xl:grid-cols-2 @5xl:grid-cols-3">
            {cards.map((c) => (
              <BoardCard
                key={c.feature.slug}
                card={c}
                selected={selected.has(c.feature.slug)}
                onToggleSelect={(slug) => onToggleSelect(areaId, slug)}
                onOpenDoc={onOpenDoc}
                onRequestMove={(slug) => onRequestMove(areaId, slug)}
              />
            ))}
          </div>
        </SortableContext>
      )}
    </div>
  );
}
