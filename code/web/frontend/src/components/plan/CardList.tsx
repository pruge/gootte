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
  onToggleSelect: (areaId: BoardAreaId, slug: string) => void;
  onOpenDoc: (slug: string) => void;
  onRequestMove: (areaId: BoardAreaId, slug: string) => void;
}

/**
 * 칸 하나의 카드 목록이자 **놓을 자리**다.
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
  onToggleSelect,
  onOpenDoc,
  onRequestMove,
}: CardListProps) {
  const { setNodeRef, isOver } = useDroppable({ id: AREA_DROP_ID(areaId) });

  return (
    <div
      ref={setNodeRef}
      data-drop-area={areaId}
      aria-label={`${AREA_LABEL[areaId]} 칸`}
      className={`@container h-full overflow-y-auto p-3 transition-colors ${
        isOver ? "bg-accent/8 ring-1 ring-inset ring-accent/40" : ""
      }`}
    >
      {cards.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-muted">
          <IconInbox size={26} stroke={1.25} />
          <p className="text-sm">{empty}</p>
        </div>
      ) : (
        <SortableContext items={cards.map((c) => c.feature.slug)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 items-start gap-2.5 @2xl:grid-cols-2 @5xl:grid-cols-3">
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
