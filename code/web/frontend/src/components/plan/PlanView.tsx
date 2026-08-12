import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { PlanBoardResponse, PlanCard } from "@gootte/contract";
import { usePlanBoard, usePlanMove } from "../../lib/query";
import { Loading, ErrorMsg } from "../common/states";
import { BoardCard } from "./BoardCard";
import { CardList } from "./CardList";
import { MoveDialog } from "./MoveDialog";
import { featureDocPath } from "./planDoc";
import {
  AREA_LABEL,
  TAB_DROP_ID,
  changesBoard,
  dropTargetArea,
  insertIndex,
  storedArea,
  type BoardAreaId,
} from "./areas";

/**
 * 아래 칸의 네 탭 — 캡틴 그림의 순서 그대로(대기 · 예약 · 폐기 · 완료).
 * 🔴 `id` 는 응답의 칸 이름과 **같은 문자열**이다(`areas.ts`).
 */
const TABS = [
  { id: "waiting", empty: "docs/features/ 아래 기능이 없습니다." },
  { id: "reserved", empty: "내려 둔 기능이 없습니다." },
  { id: "discarded", empty: "폐기한 기능이 없습니다." },
  { id: "done", empty: "완료된 기능이 없습니다." },
] as const satisfies readonly { id: BoardAreaId; empty: string }[];

/** 고른 것이 없는 칸에 넘기는 빈 묶음 — 렌더마다 새 Set 을 만들지 않는다. */
const EMPTY_SET: ReadonlySet<string> = new Set();

/**
 * 끌기를 소리로 듣는 캡틴에게 하는 말 — dnd-kit 기본값은 영어라 그대로 두면 이 화면에서
 * 여기만 다른 언어가 된다. 안내는 **끌기 조작만** 말한다 — 어디에 놓으면 안 되는지 같은
 * 경고는 없다(INV-B3).
 */
const A11Y = {
  screenReaderInstructions: {
    draggable:
      "스페이스바로 카드를 집습니다. 집은 뒤에는 화살표 키로 옮기고, 스페이스바로 놓거나 Esc 로 되돌립니다.",
  },
  announcements: {
    onDragStart: ({ active }: { active: { id: string | number } }) => `${active.id} 카드를 집었습니다.`,
    onDragOver: ({ over }: { over: { id: string | number } | null }) =>
      over ? `${dropLabel(over.id)} 위에 있습니다.` : "놓을 자리 밖입니다.",
    onDragEnd: ({ over }: { over: { id: string | number } | null }) =>
      over ? `${dropLabel(over.id)} 자리에 놓았습니다.` : "제자리로 돌아왔습니다.",
    onDragCancel: () => "끌기를 되돌렸습니다.",
  },
};

/** 놓을 자리를 사람의 말로 — 안내에 `tab:reserved` 같은 내부 식별자가 새어 나가지 않게. */
function dropLabel(overId: string | number): string {
  const id = String(overId);
  const area = id.startsWith("area:") || id.startsWith("tab:") ? id.split(":")[1] : null;
  return area ? `${AREA_LABEL[area as BoardAreaId]} 칸` : id;
}

/** 칸 하나의 카드 수 — 화면이 세는 것이 아니라 서버가 갈라 준 목록의 길이다(INV-1). */
function Count({ n }: { n: number }) {
  return <span className="mono shrink-0 text-sm tabular-nums text-muted">{n}</span>;
}

/**
 * 탭 머리도 **놓을 자리**다 — 접힌 칸으로 카드를 보내는 유일한 끌기 경로다.
 * 탭이 droppable 이 아니면 지금 열려 있지 않은 칸에는 끌어서 갈 방법이 없고, 캡틴은 칸을 먼저
 * 열고 다시 잡아야 한다.
 */
function TabButton({
  id,
  count,
  selected,
  onSelect,
}: {
  id: BoardAreaId;
  count: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: TAB_DROP_ID(id) });
  return (
    <button
      ref={setNodeRef}
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={`mono flex items-baseline gap-1.5 rounded-md px-3 py-1 text-sm transition-colors ${
        selected ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"
      } ${isOver ? "ring-1 ring-accent bg-accent/12 text-accent" : ""} focus-visible:outline-2 focus-visible:outline-accent`}
    >
      {AREA_LABEL[id]}
      <Count n={count} />
    </button>
  );
}

/** 어느 칸에 담겨 있는가가 곧 그 카드의 자리다 — 카드는 자리를 값으로 들고 있지 않다(contract). */
function areaOfCard(board: PlanBoardResponse, slug: string): BoardAreaId | undefined {
  const keys: BoardAreaId[] = ["waiting", "active", "reserved", "discarded", "done"];
  return keys.find((k) => board[k].some((c) => c.feature.slug === slug));
}

interface PlanViewProps {
  project: string;
  /** 카드 머리의 문서 아이콘 — `features` 탭의 **기존 통로**로 넘긴다(두 번째 문서 보기 없음). */
  onOpenFeatureDoc: (feature: string, path: string | null) => void;
}

/**
 * `plan` 탭 — 다섯 자리 판(plan-board/02)과 **캡틴의 손**(03).
 *
 * 🔴 다섯 칸은 **서버가 이미 갈라 보낸 것**을 그대로 그린다 — 화면은 자리를 판정하지 않는다.
 * 문서를 새로 쓰면 자리 행이 없는 채로 대기 칸에 뜨고(INV-B1), 그 갱신은 이미 있는 실시간
 * 배선(WS `/api/live` → `plan` 쿼리 invalidate, spec F1·F3)을 타므로 새 감시를 만들지 않는다.
 *
 * 🔴 **놓을 때 검사하지 않는다**(INV-B3). 옛 판에는 드래그마다 경고 넷이 있었고 01 이 걷어냈다 —
 * 되살리지 않는다. 캡틴이 놓은 자리가 곧 정답이고, 화면이 할 일은 어디에 놓았는지 서버에
 * 그대로 전하는 것뿐이다. 완료로 보낼 때 이유를 묻는 입력창도 없다(캡틴 결정).
 *
 * 체크상자·자동 완료·접힘은 04, 단계 매기기와 `next` 는 05 다.
 */
export function PlanView({ project, onOpenFeatureDoc }: PlanViewProps) {
  const { data, isLoading, isError, error } = usePlanBoard(project);
  const move = usePlanMove(project);
  const [tab, setTab] = useState<BoardAreaId>("waiting");
  // 여러 장 고르기 — 한 칸 안에서만 묶인다. 다른 칸의 카드를 고르면 묶음이 그 칸으로 옮겨간다.
  const [picked, setPicked] = useState<{ area: BoardAreaId; slugs: string[] }>({
    area: "waiting",
    slugs: [],
  });
  const [dragging, setDragging] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ area: BoardAreaId; slugs: string[] } | null>(null);

  const sensors = useSensors(
    // 6px 움직여야 끌기 — 그 아래는 클릭이라 머리글 토글과 아이콘 둘이 그대로 눌린다.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const board = data;
  const pickedSet = useMemo(() => new Set(picked.slugs), [picked]);

  if (isLoading) return <Loading label="판을 그리는 중…" />;
  if (isError) return <ErrorMsg error={error} />;
  if (!board) return null;

  const slugsOf = (area: BoardAreaId): string[] => board[area].map((c) => c.feature.slug);
  const cardOf = (slug: string): PlanCard | undefined =>
    board[areaOfCard(board, slug) ?? "waiting"].find((c) => c.feature.slug === slug);

  /** 이 카드를 잡으면 무엇이 따라오나 — 고른 묶음 안이면 묶음 전체, 아니면 그 한 장. */
  const bundleFor = (area: BoardAreaId, slug: string): string[] =>
    picked.area === area && pickedSet.has(slug)
      ? slugsOf(area).filter((s) => pickedSet.has(s))
      : [slug];

  const submit = (from: BoardAreaId, to: BoardAreaId, features: string[], index: number) => {
    setPicked({ area: to, slugs: [] });
    if (!changesBoard(from, to, slugsOf(to), features, index)) return;
    move.mutate({ features, area: storedArea(to), index });
  };

  const toggleSelect = (area: BoardAreaId, slug: string) =>
    setPicked((prev) => {
      if (prev.area !== area) return { area, slugs: [slug] };
      const next = prev.slugs.includes(slug)
        ? prev.slugs.filter((s) => s !== slug)
        : [...prev.slugs, slug];
      return { area, slugs: next };
    });

  const openDoc = (slug: string) => {
    const card = cardOf(slug);
    if (card) onOpenFeatureDoc(slug, featureDocPath(card.feature));
  };

  const onDragStart = (e: DragStartEvent) => {
    const slug = String(e.active.id);
    setDragging(slug);
    // 묶음 밖의 카드를 잡으면 묶음은 풀린다 — 안 보이는 카드가 딸려 가지 않게.
    const area = areaOfCard(board, slug);
    if (area && !(picked.area === area && pickedSet.has(slug))) setPicked({ area, slugs: [] });
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const slug = String(e.active.id);
    const from = areaOfCard(board, slug);
    if (!e.over || !from) return;

    const overId = String(e.over.id);
    const overCardArea = areaOfCard(board, overId);
    const to = dropTargetArea(overId, overCardArea);
    if (!to) return;

    const features = bundleFor(from, slug);
    const overSlug = overCardArea === to ? overId : null;
    submit(from, to, features, insertIndex(slugsOf(to), features, overSlug));
  };

  const current = TABS.find((t) => t.id === tab) ?? TABS[0];
  const draggingCard = dragging ? cardOf(dragging) : undefined;
  const draggingCount = dragging && areaOfCard(board, dragging)
    ? bundleFor(areaOfCard(board, dragging) as BoardAreaId, dragging).length
    : 1;

  return (
    <DndContext
      accessibility={A11Y}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="flex h-full min-h-0 flex-col gap-4">
        {/* ── 위: 작업 대상 — 지금 붙들고 갈 것. accent 가 이 칸 하나에만 붙는다 ── */}
        <section
          aria-labelledby="board-active-heading"
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-accent/35 bg-surface"
        >
          <header className="flex shrink-0 items-baseline gap-2.5 border-b border-accent/25 bg-accent/8 px-4 py-2.5">
            <h2 id="board-active-heading" className="font-medium tracking-tight text-accent">
              작업 대상
            </h2>
            <Count n={board.active.length} />
            {/* 여러 장 옮기기는 눈에 보이지 않는 기능이라 화면이 말해 준다 — 캡틴이 알아내야 할 것이 아니다. */}
            <span className="ml-auto shrink-0 text-sm text-muted">
              {picked.slugs.length > 0
                ? `${AREA_LABEL[picked.area]} ${picked.slugs.length}장 고름 — 하나를 끌면 함께 갑니다`
                : "카드를 끌어 옮깁니다 · ⌘/Ctrl+클릭으로 여러 장"}
            </span>
            {move.isError && (
              <span role="alert" className="shrink-0 text-sm text-drop">
                {move.error instanceof Error ? move.error.message : "옮기지 못했습니다"}
              </span>
            )}
          </header>
          <CardList
            areaId="active"
            cards={board.active}
            empty="작업 대상이 비어 있습니다."
            selected={picked.area === "active" ? pickedSet : EMPTY_SET}
            onToggleSelect={toggleSelect}
            onOpenDoc={openDoc}
            onRequestMove={(area, slug) => setDialog({ area, slugs: bundleFor(area, slug) })}
          />
        </section>

        {/* ── 아래: 네 탭 한 칸. 탭 머리도 놓을 자리다 ── */}
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface">
          <div
            role="tablist"
            aria-label="자리"
            className="flex shrink-0 gap-1 border-b border-border bg-surface-2/40 px-2 py-1.5"
          >
            {TABS.map((t) => (
              <TabButton
                key={t.id}
                id={t.id}
                count={board[t.id].length}
                selected={t.id === tab}
                onSelect={() => setTab(t.id)}
              />
            ))}
          </div>
          <div role="tabpanel" aria-label={AREA_LABEL[current.id]} className="min-h-0 flex-1">
            <CardList
              areaId={current.id}
              cards={board[current.id]}
              empty={current.empty}
              selected={picked.area === current.id ? pickedSet : EMPTY_SET}
              onToggleSelect={toggleSelect}
              onOpenDoc={openDoc}
              onRequestMove={(area, slug) => setDialog({ area, slugs: bundleFor(area, slug) })}
            />
          </div>
        </section>
      </div>

      {/* 끌고 있는 동안 손끝에 붙어 오는 사본 — 여러 장이면 몇 장인지 말한다. */}
      <DragOverlay>
        {draggingCard && (
          <div className="relative w-[min(420px,80vw)]">
            <BoardCard card={draggingCard} overlay selected />
            {draggingCount > 1 && (
              <span className="mono absolute -right-2 -top-2 rounded-full bg-accent px-2 py-0.5 text-sm text-accent-fg shadow">
                {draggingCount}장
              </span>
            )}
          </div>
        )}
      </DragOverlay>

      {dialog && (
        <MoveDialog
          features={dialog.slugs}
          from={dialog.area}
          onClose={() => setDialog(null)}
          onMove={(to) => {
            setDialog(null);
            // 대화상자로 보낸 카드는 늘 그 칸의 맨 뒤에 선다 — 자리까지 묻지 않는다(끌기의 대체 경로다).
            submit(dialog.area, to, dialog.slugs, slugsOf(to).length);
          }}
        />
      )}
    </DndContext>
  );
}
