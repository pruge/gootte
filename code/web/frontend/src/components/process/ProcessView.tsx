import { useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
  IconArrowMoveRight,
  IconFlag,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerTrackNext,
} from "@tabler/icons-react";
import { allTickets } from "@gootte/core";
import type { Feature, FeatureTicket } from "@gootte/contract";
import { useHoverTip } from "../HoverTip";
import { usePlanBoard, usePlanMove, useRecordTime } from "../../lib/query";
import { featureDescription } from "../plan/cardTitle";
import { DocDrawer } from "../features/DocDrawer";
import { Loading, ErrorMsg } from "../common/states";
import { MoveDialog } from "../plan/MoveDialog";
import { FeatureDocsButton } from "../features/FeatureDocsButton";
import {
  AREA_DROP_ID,
  AREA_LABEL,
  changesBoard,
  dropTargetArea,
  insertIndex,
  storedArea,
  type BoardAreaId,
} from "../plan/areas";
import { useResizableSplit } from "../../hooks/useResizableSplit";
import { WaitingCard, WaitingList } from "./WaitingList";
import { openCount } from "./openCount";

interface ProcessViewProps {
  project: string;
}

// 아래 칸(대기)의 높이 — plan 탭 손잡이와 **다른 키**를 쓴다(둘의 자리는 서로 남남이다).
const WAITING_HEIGHT_KEY = "gootte-process-waiting-h";
const WAITING_DEFAULT_HEIGHT = 200; // 첫 방문 — 대기 카드 서너 줄
const WAITING_MIN_HEIGHT = 72; // 완전히 접히면 다시 늘릴 손잡이를 잃는다

/**
 * 어디에 놓이는가 — 🔴 **포인터가 들어가 있는 곳이 그 자리다.**
 *
 * dnd-kit 기본값(`closestCenter`)은 포인터가 droppable 안에 있는지 보지 않고 가장 가까운 것을
 * 늘 하나 고른다. 그 기본값을 쓰면 **아무 데나 놓아도** 어느 칸엔가 걸려 버린다(T02 AC3 위반).
 * 그래서 중심 거리로는 내려가지 않는다 — 포인터가 들어간 것, 없으면 겹친 것(키보드 끌기처럼
 * 포인터 좌표가 없을 때), 그것도 없으면 아무 데도 아닌 곳이다.
 *
 * 🔴 **놓을 자리가 둘이 된 뒤에도(T03) 이 선택은 그대로다.** 두 칸은 `<aside>` 안에서 위아래로
 * 맞붙어 있을 뿐 겹치지 않아, 포인터는 늘 둘 중 **한 칸에만** 들어간다 — `pointerWithin` 이
 * 애매해지는 자리가 없다. 오른쪽 2/3 은 여전히 어느 칸도 아니라 "아무 데도 아닌 곳" 이 남는다.
 */
const collideByPointer: CollisionDetection = (args) => {
  const inside = pointerWithin(args);
  return inside.length > 0 ? inside : rectIntersection(args);
};

/**
 * 끌기를 소리로 듣는 캡틴에게 하는 말 — dnd-kit 기본 안내는 영어라 그대로 두면 이 화면에서
 * 여기만 다른 언어가 된다(plan 탭과 같은 규율).
 */
const areaLabelOf = (overId: string | number): string => {
  const area = dropTargetArea(String(overId), undefined);
  return area ? AREA_LABEL[area] : "";
};

const A11Y = {
  screenReaderInstructions: {
    draggable:
      "스페이스바로 카드를 집습니다. 집은 뒤에는 화살표 키로 작업 대상 칸이나 대기 칸까지 옮기고, 스페이스바로 놓거나 Esc 로 되돌립니다. 카드를 그냥 고르려면 엔터를 누릅니다.",
  },
  announcements: {
    onDragStart: ({ active }: { active: { id: string | number } }) => `${active.id} 카드를 집었습니다.`,
    onDragOver: ({ over }: { over: { id: string | number } | null }) =>
      over ? `${areaLabelOf(over.id)} 칸 위에 있습니다.` : "놓을 자리 밖입니다.",
    onDragEnd: ({ over }: { over: { id: string | number } | null }) =>
      over ? `${areaLabelOf(over.id)} 칸에 놓았습니다.` : "제자리로 돌아왔습니다.",
    onDragCancel: () => "끌기를 되돌렸습니다.",
  },
};

/**
 * 위 칸(작업 대상 목록)을 **놓을 자리**로 감싼다 — 목록이 짧아도 칸의 남은 높이 전체가 표적이다
 * (`flex-1`). 놓기 목적지 id 는 plan 탭과 **같은 문자열**(`AREA_DROP_ID("active")`)이라, 이 화면이
 * 자기만의 사전을 따로 두지 않는다.
 *
 * `useDroppable` 은 `DndContext` **안**에서만 부를 수 있어 `ProcessView` 본문이 아니라 이 조각이
 * 갖는다.
 */
function ActiveDropZone({ highlighted, children }: { highlighted: boolean; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id: AREA_DROP_ID("active") });
  return (
    <div
      ref={setNodeRef}
      data-drop-area="active"
      data-drop-over={highlighted || undefined}
      className={`min-h-0 flex-1 overflow-y-auto rounded-md transition-colors ${
        highlighted ? "bg-accent/10 ring-2 ring-inset ring-accent/50" : ""
      }`}
    >
      {children}
    </div>
  );
}

/**
 * 아래 칸(대기 목록)을 **놓을 자리**로 감싼다 — 위 칸의 짝이다(T03).
 *
 * 🔴 **대기가 0 이어도 이 자리는 있다.** 대기가 비면 T01 이 손잡이도 상자도 만들지 않고 한 줄만
 * 남기는데(빈 상자가 위 칸의 자리를 먹지 않게), 그러면 첫 카드를 내릴 곳이 사라진다. 그래서
 * **감싸는 쪽**을 놓기 대상으로 둔다 — 대기가 0 이면 그 한 줄이 그대로 표적이고, 있으면 손잡이와
 * 상자 전체가 표적이다. 어느 경우에도 "내릴 곳이 없는 상태" 가 생기지 않는다.
 */
function WaitingDropZone({ highlighted, children }: { highlighted: boolean; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id: AREA_DROP_ID("waiting") });
  return (
    <div
      ref={setNodeRef}
      data-drop-area="waiting"
      data-drop-over={highlighted || undefined}
      className={`flex shrink-0 flex-col rounded-md transition-colors ${
        highlighted ? "bg-accent/10 ring-2 ring-inset ring-accent/50" : ""
      }`}
    >
      {children}
    </div>
  );
}

/**
 * 위 칸(작업 대상)의 카드 하나 — 누르면 선택이고, **잡아서 아래 대기 칸으로 내린다**(T03).
 *
 * 🔴 이 카드는 원래부터 `<button>` 이다 — 끌기 배선을 그 위에 그대로 얹는다. dnd-kit 의
 * `attributes` 가 얹는 `role="button"` 은 이미 버튼인 이 요소에는 덮어쓸 것이 없다(대기 카드에서
 * `<li>` 를 피해야 했던 T02 의 함정이 여기서는 생기지 않는다).
 *
 * 🔴 **Enter 는 여전히 선택이다.** 부모가 `KeyboardSensor` 의 시작 키를 Space 하나로 좁혀 두었기
 * 때문에(둘 다면 Enter 가 끌기에 먹혀 키보드로 기능을 고를 길이 사라진다) 이 버튼의 Enter 는
 * 그대로 클릭이 된다. Space 는 dnd-kit 이 가져가 카드를 집는다.
 */
function ActiveFeatureCard({
  feature,
  selected,
  onSelect,
}: {
  feature: Feature;
  selected: boolean;
  onSelect: (slug: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: feature.slug,
    attributes: { roleDescription: "카드 — 아래 대기 칸으로 끌어 내립니다" },
  });
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onSelect(feature.slug)}
      aria-current={selected ? "true" : undefined}
      className={`flex w-full touch-none items-baseline gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
        selected ? "bg-accent/12 font-semibold text-fg" : "text-muted hover:bg-surface-2 hover:text-fg"
      } ${isDragging ? "opacity-40" : ""} focus-visible:outline-2 focus-visible:outline-accent`}
    >
      <span className="min-w-0 flex-1 truncate">{feature.slug}</span>
      {/* 🔴 처리중 티켓이 있으면 파란 원점 — 배경색 말고도 붙들 것이 있다(INV-C2).
          `allTickets` 로 두 관례(구 issues/ · 신 tickets/)를 합쳐, status 가 in_progress 인
          티켓이 하나라도 있으면 점을 찍는다. 판정 자리는 서버(`applyInProgress`) 하나다.
          숫자(남은 티켓 수) 앞에 둔다 — 캡틴 지시(2026-09-02). */}
      {allTickets(feature).some((t) => t.status === "in_progress") && (
        <span
          role="status"
          aria-label={`${feature.slug} 처리중 티켓 있음`}
          title="처리중 티켓 있음"
          className="h-2 w-2 shrink-0 rounded-full bg-active"
        />
      )}
      {/* 🔴 남은(open) 티켓 수 — 완료·폐기 제외. `allTickets` 로 두 관례를 합쳐 센다(INV-1,
          서버가 준 값만 셀 뿐 다시 판정하지 않는다). 0 이어도 칸이 사라지지 않는다. */}
      <span
        title="남은 티켓 수"
        className={`mono shrink-0 rounded-full px-1.5 text-xs font-medium tabular-nums ${
          openCount(feature) > 0 ? "bg-accent/15 text-accent" : "bg-surface-2 text-muted"
        }`}
      >
        {openCount(feature)}
      </span>
      {feature.hasUnreadTicket === true && (
        <span className="mono shrink-0 rounded bg-unread-strong px-1.5 py-0.5 text-sm font-medium text-unread-fg">
          안 읽음
        </span>
      )}
    </button>
  );
}

/**
 * `process`(steps) 탭 — 작업 대상 feature 를 **2컬럼(1:2)** 으로 읽는다(process-two-column/T01).
 *
 * - **왼쪽(1/3)**: 작업 대상(`PlanBoardResponse.active`)의 feature 목록. 클릭하면 선택.
 * - **오른쪽(2/3)**: 선택한 feature 의 **모든 티켓** — 구관례(`issues/`)와 신관례(`tickets/`)를
 *   합쳐 번호·제목·상자·안 읽음·처리중·단계로 줄 세운다. **완료([x])·폐기([-]) 티켓도 숨기지 않는다**
 *   (캡틴 지시: "여기서는 완료된것을 숨길필요가 없다").
 *
 * 🔴 화면은 서버가 이미 계산해 보낸 값만 그린다(INV-1) — 티켓 상태·상자·단계는 core 판정을 그대로
 *   옮겨 실을 뿐 여기서 다시 재지 않는다. 선택 상태는 화면 로컬이다(파생물, 저장하지 않는다).
 */
export function ProcessView({ project }: ProcessViewProps) {
  const { data, isError, error } = usePlanBoard(project);
  const { record: recordTime } = useRecordTime(project);
  const move = usePlanMove(project);
  const [selected, setSelected] = useState<string | null>(null);
  const [ticketDoc, setTicketDoc] = useState<{ feature: string; path: string } | null>(null);
  const [moveDialog, setMoveDialog] = useState<string | null>(null);
  // 위(작업 대상)·아래(대기)를 가르는 손잡이 — 아래 칸 높이만 여기서 정하고 위 칸은 `flex-1` 이
  // 나머지를 흡수한다. plan 탭(`PlanView`)과 **같은 훅**이다(새 분할 구현을 만들지 않는다).
  const split = useResizableSplit(WAITING_HEIGHT_KEY, {
    defaultHeight: WAITING_DEFAULT_HEIGHT,
    min: WAITING_MIN_HEIGHT,
  });
  // 지금 손에 들린 카드와, 지금 어느 칸을 향하고 있는가 — 둘 다 **화면의 상태**다(저장하지 않는다).
  const [dragging, setDragging] = useState<string | null>(null);
  const [overArea, setOverArea] = useState<BoardAreaId | null>(null);
  const sensors = useSensors(
    // 🔴 6px 움직여야 끌기 — plan 탭과 **같은 기준**이다(그 아래는 클릭이라 목록 단추가 그대로 눌린다).
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // 🔴 집는 키는 **Space 하나**다(dnd-kit 기본값은 Space·Enter 둘) — 카드가 이제 끌기와 선택을
    // 둘 다 받으므로, Enter 까지 끌기가 가져가면 키보드로 기능을 고를 길이 사라진다(T03).
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  if (isError && !data) return <ErrorMsg error={error} />;
  if (!data) return <Loading label="순서를 읽는 중…" />;

  const features = data.active.map((c) => c.feature);
  // 🔴 대기 목록도 서버가 이미 계산해 보낸 것이다(INV-1) — 새 조회를 만들지 않는다.
  const waiting = data.waiting.map((c) => c.feature);
  // 🔴 고를 수 있는 것은 **두 칸 전부**다(T03) — 대기 카드를 눌러도 오른쪽에 티켓이 뜬다. 고른 것을
  // slug 하나로 들고 있으므로 **카드가 칸을 옮겨도 선택이 따라간다**(AC4). 기본값은 예전 그대로
  // 작업 대상의 첫 번째다 — 아무것도 안 골랐을 때의 화면이 바뀌면 안 된다.
  const selectable = [...features, ...waiting];
  const current = selectable.find((f) => f.slug === selected) ?? features[0] ?? null;
  const draggingFeature = dragging ? (selectable.find((f) => f.slug === dragging) ?? null) : null;

  // 🔴 판의 다섯 칸 — 카드가 어느 칸에 담겨 있는가가 곧 그 카드의 자리다(contract, `PlanCard` 는
  // `area` 를 싣지 않는다). 이동 아이콘의 "지금 있는 칸"(`MoveDialog` 의 `from`)을 알기 위해서만
  // 쓴다 — 자리를 판정하는 자리는 여전히 서버 하나다.
  const areaOfCard = (slug: string): BoardAreaId | undefined => {
    const keys: BoardAreaId[] = ["waiting", "active", "reserved", "discarded", "done"];
    return keys.find((k) => data[k].some((c) => c.feature.slug === slug));
  };

  // 어느 문서인가는 `FeatureDocsButton` 이 목록에서 골라 준다 — plan 탭과 **같은 컴포넌트**다.
  // 이 자리는 그 자리에서 드로어를 여는 일만 한다(탭을 옮기지 않는다).
  const openFeatureDoc = (slug: string, path: string) => {
    setTicketDoc({ feature: slug, path });
  };

  const stopDrag = () => {
    setDragging(null);
    setOverArea(null);
  };

  const onDragStart = (e: DragStartEvent) => setDragging(String(e.active.id));

  const onDragOver = (e: DragOverEvent) =>
    setOverArea(e.over ? dropTargetArea(String(e.over.id), undefined) : null);

  // 지금 들린 카드가 어느 칸에서 왔는가 — 자기 칸 위에 있을 때는 강조하지 않기 위해 쓴다
  // (제자리에 놓는 것은 아무 일도 아니므로 표적처럼 보이면 안 된다).
  const dragFrom = dragging ? areaOfCard(dragging) : undefined;
  const highlight = (area: BoardAreaId) => overArea === area && dragFrom !== area;

  /**
   * 놓았다 — 목적지 칸으로 "이 카드를 보내라" 는 요청 하나만 보낸다. 방향은 둘이다(T03):
   * 아래에서 위로면 작업 대상이 되고, 위에서 아래로면 대기로 내려간다.
   *
   * 🔴 **대기로 보내는 것은 행을 지우는 것이다** — `storedArea("waiting")` 이 `null` 이라
   * 그 뜻이 이미 그 함수 안에 있다(INV-B1). 여기서 새 값을 지어내지 않는다.
   * 🔴 몇 번째에 꽂히는지는 **서버가 정한다**(INV-1). 화면은 plan 탭과 같은 `insertIndex` 로 맨 뒤를
   * 가리킬 뿐이고(카드 위가 아니라 칸 위에 놓았으므로 `over` 는 `null` 이다), 그 값이 옳은지는
   * 서버의 `planMove` 가 판정한다.
   * 🔴 낙관 갱신은 `usePlanMove` 안에서 **동기로** 일어난다 — 여기에 `await` 를 끼워 넣지 않는다
   * (`lib/query.ts` 의 주석: 놓기 콜백 직후 dnd-kit 이 목적지를 다시 잰다).
   */
  const onDragEnd = (e: DragEndEvent) => {
    stopDrag();
    const slug = String(e.active.id);
    // 아무 데도 아닌 곳에 놓았으면 아무 일도 없다 — 조용히 제자리다(T02 AC3).
    if (!e.over) return;
    const to = dropTargetArea(String(e.over.id), undefined);
    // 이 화면이 여는 길은 두 칸 사이 왕복 하나뿐이다 — 나머지 칸은 여전히 `MoveDialog` 의 몫이다.
    if (to !== "active" && to !== "waiting") return;
    const from = areaOfCard(slug);
    if (from !== "active" && from !== "waiting") return;
    if (from === to) return;

    const destination = data[to].map((c) => c.feature.slug);
    const index = insertIndex(destination, [slug], null);
    if (!changesBoard(from, to, destination, [slug], index)) return;
    move.move({ features: [slug], area: storedArea(to), index });
  };

  return (
    <DndContext
      accessibility={A11Y}
      sensors={sensors}
      collisionDetection={collideByPointer}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={stopDrag}
    >
      <div className="flex h-full min-h-0">
        {/* 왼쪽 컬럼(1) — 위: 작업 대상 feature 목록 / 아래: 대기 목록 */}
        <aside
          ref={split.containerRef}
          className="flex w-1/3 min-h-0 shrink-0 flex-col border-r border-border pr-2"
        >
          {/* 🔴 위 칸 전체가 **놓을 자리**다 — 카드가 놓인 윗부분만이 아니라 아래 빈 자리까지 같은
              칸이다(plan 탭 `CardList` 와 같은 결). 비어 있어도 접지 않는다 — 접으면 첫 카드를 올릴
              길이 사라진다. */}
          <ActiveDropZone highlighted={highlight("active")}>
            <h2 className="mono px-2 pt-1 pb-2 text-sm font-semibold tracking-[0.15em] text-muted">
              FEATURES
            </h2>
            {features.length === 0 ? (
              <p className="px-2 text-sm text-muted">작업 대상에 올라온 것이 없다</p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {features.map((f) => (
                  <li key={f.slug}>
                    <ActiveFeatureCard
                      feature={f}
                      selected={current?.slug === f.slug}
                      onSelect={setSelected}
                    />
                  </li>
                ))}
              </ul>
            )}
          </ActiveDropZone>

          {/* ── 아래: 대기 목록. 🔴 대기가 0 이면 손잡이도 상자도 만들지 않고 한 줄로만 말한다 —
              빈 상자가 위 칸의 자리를 먹지 않게(T01 회귀 가드). 🔴 그래도 **놓을 자리는 그 한 줄이
              대신한다**(T03 AC2) — `WaitingDropZone` 이 어느 경우에도 아래 칸을 표적으로 만든다. ── */}
          <WaitingDropZone highlighted={highlight("waiting")}>
          {waiting.length === 0 ? (
            <p className="mono shrink-0 border-t border-border px-2 py-2 text-sm text-muted">
              WAITING — 대기 중인 기능이 없다
            </p>
          ) : (
            <>
              {/* 손잡이 — 끌면 아래 칸 높이가 바뀌고 위 칸이 나머지를 먹는다. 화살표 키·Home·End 로도
                  조절된다(plan 탭과 같은 훅·같은 조작). */}
              <div
                role="separator"
                aria-orientation="horizontal"
                aria-label="작업 대상과 대기 목록의 경계 — 끌거나 화살표 키로 크기를 조절합니다"
                aria-valuenow={Math.round(split.height)}
                aria-valuemin={split.min}
                aria-valuemax={split.max !== undefined ? Math.round(split.max) : undefined}
                tabIndex={0}
                onPointerDown={split.onPointerDown}
                onPointerMove={split.onPointerMove}
                onPointerUp={split.onPointerUp}
                onKeyDown={split.onKeyDown}
                className="group flex shrink-0 cursor-row-resize touch-none items-center justify-center py-2 focus-visible:outline-2 focus-visible:outline-accent"
              >
                <div className="h-1 w-10 rounded-full bg-border transition-colors group-hover:bg-accent/60" />
              </div>
              <section
                aria-labelledby="process-waiting-heading"
                className="shrink-0 overflow-y-auto border-t border-border"
                style={{ height: split.height }}
              >
                <h2
                  id="process-waiting-heading"
                  className="mono px-2 pt-2 pb-2 text-sm font-semibold tracking-[0.15em] text-muted"
                >
                  WAITING
                </h2>
                <WaitingList
                  features={waiting}
                  selected={current?.slug ?? null}
                  onSelect={setSelected}
                />
              </section>
            </>
          )}
          </WaitingDropZone>
        </aside>

        {/* 오른쪽 컬럼(2) — 선택된 feature 의 모든 티켓 (완료 포함) */}
        <div className="min-w-0 flex-1 overflow-y-auto pl-4">
          {!current ? (
            <p className="text-sm text-muted">작업 대상에 올라온 것이 없다</p>
          ) : (
            <div>
              <FeatureHeading
                feature={current}
                onOpenDoc={openFeatureDoc}
                onRequestMove={setMoveDialog}
              />
              <ul className="mt-2 divide-y divide-border/30">
                {allTickets(current).map((t) => (
                  <TicketLine
                    key={`${current.slug}/${t.slug}`}
                    feature={current}
                    ticket={t}
                    onOpen={() =>
                      setTicketDoc({ feature: current.slug, path: t.path })
                    }
                    onTimeAction={(action) =>
                      recordTime({ feature: current.slug, ticket: t.num, action })
                    }
                  />
                ))}
              </ul>
            </div>
          )}
        </div>

        <DocDrawer
          project={project}
          featureSlug={ticketDoc?.feature ?? null}
          path={ticketDoc?.path ?? null}
          onClose={() => setTicketDoc(null)}
        />

        {moveDialog && current && (
          <MoveDialog
            features={[moveDialog]}
            from={areaOfCard(moveDialog) ?? "active"}
            onClose={() => setMoveDialog(null)}
            onMove={(to) => {
              setMoveDialog(null);
              const from = areaOfCard(moveDialog) ?? "active";
              if (!changesBoard(from, to, data[to].map((c) => c.feature.slug), [moveDialog], data[to].length)) return;
              move.move({ features: [moveDialog], area: storedArea(to), index: data[to].length });
            }}
          />
        )}
      </div>

      {/* 끌고 있는 동안 손끝에 붙어 오는 사본 — 놓으면 카드가 이미 위 칸에 앉아 있으므로
          (`usePlanMove` 의 동기 프레임) 사본이 옛 자리로 되돌아가 붙지 않는다. */}
      <DragOverlay>
        {draggingFeature && <WaitingCard feature={draggingFeature} overlay />}
      </DragOverlay>
    </DndContext>
  );
}

/** 오른쪽 컬럼 머리 — 기능 이름 + 설명문구 두 줄(plan 탭 카드 머리와 같은 자리).
 * plan 탭 카드 머리의 곁다리 세 가지(티켓 수 · spec.md 읽기 · 이동)를 그대로 실는다(캡틴 지시):
 * 캡틴이 steps 탭에 머문 채로 "이 기능이 무슨 문서인지" 와 "이 기능을 어디로 보낼지"를 정할 수 있다. */
function FeatureHeading({
  feature,
  onOpenDoc,
  onRequestMove,
}: {
  feature: Feature;
  onOpenDoc: (slug: string, path: string) => void;
  onRequestMove: (slug: string) => void;
}) {
  const description = featureDescription(feature.title, feature.slug);
  // 🔴 issues/(구관례)와 tickets/(신관례, T04) 를 합친다 — 안 그러면 tickets/ 만 쓰는 기능은
  // "티켓 0" 을 보여준다(`FeatureCard` 와 같은 결함, 2026-08-25).
  const ticketCount = allTickets(feature).length;
  return (
    <div className="flex flex-col gap-y-0.5 border-b border-border px-2 pb-2">
      <div className="flex flex-wrap items-center gap-x-2">
        <span
          className={`mono min-w-0 text-sm ${
            description ? "text-muted" : "font-medium tracking-tight"
          }`}
        >
          {feature.slug}
        </span>
        {feature.hasUnreadTicket === true && (
          <span
            role="status"
            className="mono shrink-0 rounded bg-unread-strong px-1.5 py-0.5 text-sm font-medium text-unread-fg"
          >
            안 읽음
          </span>
        )}
        <span className="mono shrink-0 text-sm tabular-nums text-muted">티켓 {ticketCount}</span>
        <span className="ml-auto flex shrink-0 items-center gap-0.5">
          <FeatureDocsButton feature={feature} onOpen={(path) => onOpenDoc(feature.slug, path)} />
          <button
            type="button"
            onClick={() => onRequestMove(feature.slug)}
            aria-label={`${feature.slug} 다른 칸으로 보내기`}
            title="어느 칸으로 보낼지 고른다"
            className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            <IconArrowMoveRight size={17} stroke={1.6} />
          </button>
        </span>
      </div>
      {description && (
        <span className="break-words text-sm font-medium tracking-tight">{description}</span>
      )}
    </div>
  );
}

/** 상자 글리프 — `[x]`/`[-]`/`[ ]` 는 문서 상태에서 이미 계산된 `ticket.status` 로 그린다. */
function boxGlyph(t: FeatureTicket): string {
  if (t.status === "done") return "[x]";
  if (t.status === "dropped") return "[-]";
  return "[ ]";
}

function rowTone(t: FeatureTicket): string {
  return t.unread === true
    ? "bg-unread hover:bg-unread-strong"
    : t.status === "in_progress"
      ? "bg-inprogress hover:bg-inprogress-strong"
      : "hover:bg-surface-2";
}

function TicketLine({
  feature,
  ticket,
  onOpen,
  onTimeAction,
}: {
  feature: Feature;
  ticket: FeatureTicket;
  onOpen: () => void;
  onTimeAction: (action: "start" | "pause" | "resume" | "end") => void;
}) {
  const closed = ticket.status === "done" || ticket.status === "dropped";
  // T02 — 걸린 시간 어림 문구를 툴팁으로. 없으면 툴팁 자체를 띄우지 않는다(INV-4).
  const { triggerProps, tip } = useHoverTip(ticket.elapsed ?? null);
  // ADR-0002(pause) — 버튼 상태는 티켓 문서의 Time 줄에서 결정한다(서버가 이미 읽어 보낸 값).
  //   미시작: startedAt 없음 → start 버튼
  //   진행 중: startedAt 있고, 재개 안 된 paused 가 없음 → pause + end
  //   일시중단: 재개 안 된 paused 가 있음 → resume + end
  //   완료: finishedAt 있음 → 버튼 없음
  const pausedNow = ticket.pauses?.some((p) => p.resumedAt === null) === true;
  const showStart = !ticket.startedAt;
  const showPauseResume = !!ticket.startedAt && !ticket.finishedAt;
  const showEnd = !!ticket.startedAt && !ticket.finishedAt;

  const iconBtn =
    "inline-flex items-center justify-center rounded p-1 text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent";
  return (
    <li>
      <div className={`flex w-full items-stretch ${rowTone(ticket)}`}>
        <button
          type="button"
          {...triggerProps}
          onClick={onOpen}
          className="grid min-w-0 flex-1 grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] items-baseline gap-x-2.5 px-3 py-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        >
          <span className={`col-start-1 mono shrink-0 text-sm ${closed ? "text-accent" : "text-muted"}`}>
            {boxGlyph(ticket)}
          </span>
          <span className="col-start-2 mono shrink-0 text-sm tabular-nums text-muted">
            {ticket.num || "—"}
          </span>
          <span className="col-start-3 min-w-0 truncate text-sm">{ticket.title}</span>
          {ticket.unread === true && (
            <span
              role="status"
              className="col-start-4 mono shrink-0 rounded bg-unread-strong px-1.5 py-0.5 text-sm font-medium text-unread-fg"
            >
              안 읽음
            </span>
          )}
          {ticket.status === "in_progress" && (
            <span role="status" className="col-start-5 mono shrink-0 text-sm font-medium text-active">
              처리중
            </span>
          )}
        </button>
        {!closed && (
          <span className="flex shrink-0 items-center gap-0.5 pr-1.5">
            {showStart && (
              <button
                type="button"
                onClick={() => onTimeAction("start")}
                aria-label={`${feature.slug} ${ticket.num} 시작`}
                title="시작"
                className={iconBtn}
              >
                <IconPlayerPlay size={14} stroke={1.75} />
              </button>
            )}
            {showPauseResume &&
              (pausedNow ? (
                <button
                  type="button"
                  onClick={() => onTimeAction("resume")}
                  aria-label={`${feature.slug} ${ticket.num} 재개`}
                  title="재개"
                  className={iconBtn}
                >
                  <IconPlayerTrackNext size={14} stroke={1.75} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onTimeAction("pause")}
                  aria-label={`${feature.slug} ${ticket.num} 일시중단`}
                  title="일시중단"
                  className={iconBtn}
                >
                  <IconPlayerPause size={14} stroke={1.75} />
                </button>
              ))}
            {showEnd && (
              <button
                type="button"
                onClick={() => onTimeAction("end")}
                aria-label={`${feature.slug} ${ticket.num} 완료`}
                title="완료"
                className={iconBtn}
              >
                <IconFlag size={14} stroke={1.75} />
              </button>
            )}
          </span>
        )}
      </div>
      {tip}
    </li>
  );
}
