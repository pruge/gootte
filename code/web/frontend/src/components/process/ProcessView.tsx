import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { groupProcessSteps, UNRANKED_STEP, type ProcessRow, type ProcessStepGroup } from "@gootte/core/plan";
import { usePlanBoard, useStepMove } from "../../lib/query";
import { ticketDocPath } from "../plan/planDoc";
import { featureDescription } from "../plan/cardTitle";
import { DocDrawer } from "../features/DocDrawer";
import { Loading, ErrorMsg } from "../common/states";
import { dragId, findRow, parseDropTarget, ON_STEP_ID, GAP_ID, UNRANKED_ID } from "./dnd";

interface ProcessViewProps {
  project: string;
}

/**
 * 어디에 놓이는가 — `plan` 탭과 같은 순서(캡틴 지시): 포인터가 들어간 것 → 겹친 것 →
 * 키보드 끌기처럼 포인터가 없을 때만 중심 거리(`PlanView.tsx` §어디에 놓이는가).
 */
const collideByPointer: CollisionDetection = (args) => {
  const inside = pointerWithin(args);
  if (inside.length > 0) return inside;
  const overlapping = rectIntersection(args);
  return overlapping.length > 0 ? overlapping : closestCenter(args);
};

const A11Y = {
  screenReaderInstructions: {
    draggable:
      "스페이스바로 티켓을 집습니다. 집은 뒤에는 화살표 키로 옮기고, 스페이스바로 놓거나 Esc 로 되돌립니다.",
  },
};

/**
 * `process` 탭 — 작업 대상 티켓을 단계 순서로 줄 세우고(plan-board/07), 캡틴이 끌어 단계를
 * 정한다(plan-board/08).
 *
 * 🔴 **단계 판정 자리는 그대로 하나다.** `groupProcessSteps`(core)가 서버가 이미 실어 보낸
 * 표시 단계(`PlanCard.steps`, plan-board/05)를 모아 줄 뿐이고, 여기서 다시 계산하지 않는다.
 * 놓은 자리 → 저장 숫자 계산도 서버의 `placeStep`(core) 하나뿐이다 — 이 화면은 "어느 자리에
 * 놓았다" 만 말한다(spec §놓은 자리를 저장 숫자로 옮기는 계산).
 *
 * 🔴 **끝난 티켓([x])은 집히지 않는다** — `useDraggable` 을 그 줄에서 끈다(캡틴 결정).
 * 🔴 **놓을 때 검사하지 않는다**(INV-B3) — 놓은 자리를 서버로 그대로 보낼 뿐이다.
 */
export function ProcessView({ project }: ProcessViewProps) {
  const { data, isLoading, isError, error } = usePlanBoard(project);
  const stepMove = useStepMove(project);
  const [ticketDoc, setTicketDoc] = useState<{ feature: string; path: string } | null>(null);
  const [dragging, setDragging] = useState<ProcessRow | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (isLoading) return <Loading label="순서를 읽는 중…" />;
  if (isError) return <ErrorMsg error={error} />;
  if (!data) return null;

  const groups = groupProcessSteps(data.active);
  // 이름 둘째 줄에 쓸 설명문구는 기능 표제에서 온다(plan 탭 BoardCard 와 같은 자리) — `steps`
  // 계산과 달리 core 의 판정이 아니라 화면 서식이라 여기서 조회한다(카드는 이미 있다, INV-1).
  const featureTitleOf = new Map(data.active.map((c) => [c.feature.slug, c.feature.title]));
  const numbered = groups.filter((g) => g.step !== UNRANKED_STEP);
  const unranked = groups.find((g) => g.step === UNRANKED_STEP);

  const onDragStart = (e: DragStartEvent) => setDragging(findRow(groups, String(e.active.id)));

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    if (!e.over) return;
    const target = parseDropTarget(String(e.over.id));
    if (!target) return;
    const row = findRow(groups, String(e.active.id));
    if (!row) return;
    stepMove.move({ feature: row.feature, ticket: row.ticket, target });
  };

  const openDoc = (row: ProcessRow) =>
    setTicketDoc({ feature: row.feature, path: ticketDocPath({ slug: row.ticket }) });

  return (
    <DndContext
      accessibility={A11Y}
      sensors={sensors}
      collisionDetection={collideByPointer}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="@container h-full min-h-0 overflow-y-auto">
        {groups.length === 0 ? (
          <p className="text-base text-muted">작업 대상에 올라온 것이 없다</p>
        ) : (
          // `plan` 탭 칸(`CardList`)과 같은 격자 — 칸 폭에 따라 한 줄에 최대 세 묶음까지 나란히 선다.
          // 🔴 틈(`GapZone`)은 격자 항목을 따로 두지 않고 **그 단계 카드 안**(위 가장자리,
          // 마지막 카드는 아래 가장자리도)에 붙인다 — 틈을 격자 항목으로 두면(`col-span-full`)
          // 카드 사이마다 한 줄을 통째로 끊어 몇 칸이든 한 줄에 하나씩만 서는 꼴이 된다
          // (캡틴 지적 2026-08-12: "3 column인데 1 column에 모두 몰려 있어").
          <div className="grid grid-cols-1 items-start gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
            {numbered.map((g, i) => (
              <StepSection
                key={g.step}
                group={g}
                featureTitleOf={featureTitleOf}
                dragging={dragging}
                onOpen={openDoc}
                beforeGap={{
                  index: i,
                  hint: i === 0 ? "여기에 놓으면 새 단계가 맨 앞에 생긴다" : "여기에 놓으면 사이에 새 단계가 생긴다",
                }}
                afterGap={
                  i === numbered.length - 1
                    ? { index: numbered.length, hint: "여기에 놓으면 번호 매겨진 단계들 맨 뒤에 새 단계가 생긴다" }
                    : null
                }
              />
            ))}
            {unranked && (
              <StepSection
                group={unranked}
                featureTitleOf={featureTitleOf}
                dragging={dragging}
                onOpen={openDoc}
                beforeGap={
                  numbered.length === 0 ? { index: 0, hint: "여기에 놓으면 새 단계가 생긴다" } : null
                }
                afterGap={null}
              />
            )}
          </div>
        )}
      </div>

      <DragOverlay>
        {dragging && (
          <div className="mono w-[min(360px,80vw)] rounded-md border border-accent/40 bg-surface px-3 py-1.5 text-sm shadow-lg">
            {dragging.num} {dragging.title}
          </div>
        )}
      </DragOverlay>

      <DocDrawer
        project={project}
        featureSlug={ticketDoc?.feature ?? null}
        path={ticketDoc?.path ?? null}
        onClose={() => setTicketDoc(null)}
      />
    </DndContext>
  );
}

/**
 * 놓을 수 있는 틈 — 번호 매겨진 단계들 **사이**, 그리고 그 앞·뒤(spec §놓을 수 있는 자리).
 * 🔴 그 단계 카드의 가장자리에 붙는 **얇은 띠**다 — 격자 항목으로 따로 두지 않는다(위 §격자
 * 참고). 안 끌고 있을 때는 얇게 접혀 있다가, 끄는 동안 눈에 띄게 펼쳐진다(캡틴 확인
 * §보여야 할 것: "놓을 수 있는 자리가 집기 전에 눈에 보이는가").
 */
function GapZone({ index, dragging, hint }: { index: number; dragging: boolean; hint: string }) {
  const { isOver, setNodeRef } = useDroppable({ id: GAP_ID(index) });
  // 🔴 안 끌고 있을 때도 높이 0 이 아니다(`h-2`) — dnd-kit 은 이 요소의 **실제 사각형**으로
  // 충돌을 재므로, 높이를 0 으로 접으면 손을 대기 전에 사각형이 없어 놓기가 이웃 단계로
  // 새어 나간다. 대신 테두리·글자를 죽여 시각적으로만 접혀 보이게 한다.
  return (
    <div
      ref={setNodeRef}
      role="note"
      aria-label={hint}
      className={`flex items-center justify-center border-2 border-dashed transition-all ${
        isOver
          ? "h-9 border-accent bg-accent/10 text-sm text-accent"
          : dragging
            ? "h-3 border-border/60 text-transparent"
            : "h-2 border-transparent text-transparent"
      }`}
    >
      {isOver && hint}
    </div>
  );
}

/** 단계 묶음 하나 — 통째로 **놓을 자리**다(9999 무더기 포함, "이미 있는 단계 위"). */
function StepSection({
  group,
  featureTitleOf,
  dragging,
  onOpen,
  beforeGap,
  afterGap,
}: {
  group: ProcessStepGroup;
  featureTitleOf: ReadonlyMap<string, string>;
  dragging: ProcessRow | null;
  onOpen: (row: ProcessRow) => void;
  /** 이 카드 **위**의 틈 — 번호 매겨진 단계에는 늘 있다(맨 앞이거나 앞 단계와의 사이). */
  beforeGap: { index: number; hint: string } | null;
  /** 이 카드 **아래**의 틈 — 번호 매겨진 단계들 중 **마지막 카드에만** 있다(9999 앞자리). */
  afterGap: { index: number; hint: string } | null;
}) {
  const unranked = group.step === UNRANKED_STEP;
  const { isOver, setNodeRef } = useDroppable({
    id: unranked ? UNRANKED_ID : ON_STEP_ID(group.step),
  });
  const isDragging = dragging !== null;
  return (
    <section
      aria-labelledby={`process-step-${group.step}`}
      className={`overflow-hidden rounded-lg border bg-surface transition-colors ${
        isDragging && isOver ? "border-accent ring-2 ring-accent/40" : "border-border"
      }`}
    >
      {beforeGap && <GapZone index={beforeGap.index} dragging={isDragging} hint={beforeGap.hint} />}
      <div ref={setNodeRef}>
        <header className="border-b border-border bg-surface-2/40 px-4 py-2">
          <h2 id={`process-step-${group.step}`} className="mono font-medium tracking-tight">
            {unranked ? "9999 — 아직 순서를 안 정했다" : `${group.step}단계`}
          </h2>
        </header>
        {/* 기능 다발 사이는 선이 아니라 빈틈으로 나눈다(캡틴 지시) — 한 단계 안에서도 어느
            다발이 끝나고 다음 다발이 시작되는지 눈에 바로 잡히게. 틈의 크기는 티켓 한 줄
            높이(2.25rem = py-2 + text-sm 줄높이)와 같다. 🔴 첫 다발 앞에는 틈을 두지
            않는다 — `gap` 은 다발 *사이*에만 생기고, 바깥 padding 을 더 얹지 않는다. */}
        <div className="flex flex-col gap-9">
          {clusterByFeature(group.rows).map((cluster, i) => (
            <div key={cluster.feature}>
              <FeatureHeader
                feature={cluster.feature}
                title={featureTitleOf.get(cluster.feature) ?? cluster.feature}
                first={i === 0}
              />
              <ul className="divide-y divide-border/30">
                {cluster.rows.map((row) => (
                  <ProcessTicketLine
                    key={`${row.feature}/${row.ticket}`}
                    row={row}
                    onOpen={() => onOpen(row)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      {afterGap && <GapZone index={afterGap.index} dragging={isDragging} hint={afterGap.hint} />}
    </section>
  );
}

/**
 * 같은 단계 안의 줄을 기능별 다발로 나눈다 — **판정이 아니라 표시 재배열**이다. 같은 단계 안
 * 순서는 의미가 없으므로(`step` 테이블에 우선순위 칸이 없다) `groupProcessSteps`가 이미 준
 * 기능순 정렬을 그대로 따라 이웃한 같은 기능 줄만 묶는다 — 순서를 다시 매기지 않는다.
 */
function clusterByFeature(rows: readonly ProcessRow[]): { feature: string; rows: ProcessRow[] }[] {
  const clusters: { feature: string; rows: ProcessRow[] }[] = [];
  for (const row of rows) {
    const last = clusters[clusters.length - 1];
    if (last && last.feature === row.feature) last.rows.push(row);
    else clusters.push({ feature: row.feature, rows: [row] });
  }
  return clusters;
}

/**
 * 기능 다발의 머리 — **회색 헤더**(캡틴 지시)에 이름과 설명문구를 두 줄로 싣는다. `plan` 탭
 * 카드 머리(`BoardCard`)와 같은 자리다. 설명이 없는 기능(표제가 곧 폴더명)은 이름 한 줄만 선다.
 *
 * 🔴 **위·아래 테두리만** — 좌우는 긋지 않는다, 둥근 모서리도 쓰지 않는다(캡틴 지시).
 * 🔴 **첫 다발의 윗변은 긋지 않는다**(캡틴 지시) — 단계 헤더의 아랫변과 겹쳐 두 줄이 겹쳐
 * 두꺼워 보였다. 첫 다발만 위 테두리를 빼 단계 헤더의 선 하나로 충분하게 한다.
 */
function FeatureHeader({ feature, title, first }: { feature: string; title: string; first: boolean }) {
  const description = featureDescription(title, feature);
  return (
    <div
      className={`flex flex-col gap-y-0.5 border-b ${first ? "" : "border-t"} border-border bg-surface-2/60 px-4 py-1.5`}
    >
      <span
        className={`mono text-sm ${description ? "text-muted" : "font-medium tracking-tight"}`}
      >
        {feature}
      </span>
      {description && (
        <span className="break-words text-sm font-medium tracking-tight">{description}</span>
      )}
    </div>
  );
}

/**
 * 티켓 한 줄 — 상자는 **제 칸**을 갖는다(캡틴 지시). 기능 이름은 다발 머리가 이미 말하므로 여기서는
 * 상자·번호·제목만 선다.
 *
 * 🔴 **끝난 티켓([x])은 집히지 않는다**(캡틴 결정) — `useDraggable` 을 그 줄에서 끈다. 누르면
 * 여는 동작(`onOpen`)은 그대로 남는다 — 6px 못 넘긴 손짓은 dnd-kit 이 클릭으로 넘긴다(`plan`
 * 탭 카드와 같은 요령).
 */
function ProcessTicketLine({ row, onOpen }: { row: ProcessRow; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId(row.feature, row.ticket),
    disabled: row.checked,
  });
  return (
    <li className={isDragging ? "opacity-30" : ""}>
      <button
        ref={setNodeRef}
        type="button"
        onClick={onOpen}
        {...attributes}
        {...listeners}
        className={`grid w-full grid-cols-[auto_auto_minmax(0,1fr)] items-baseline gap-x-2.5 px-4 py-2 text-left hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
          row.checked ? "" : "cursor-grab active:cursor-grabbing"
        }`}
      >
        <span
          className={`col-start-1 mono shrink-0 text-sm ${row.checked ? "text-accent" : "text-muted"}`}
          title={row.checked ? "문서가 완료라고 말한다" : "아직 완료가 아니다"}
        >
          {row.checked ? "[x]" : "[ ]"}
        </span>
        <span className="col-start-2 mono shrink-0 text-sm tabular-nums text-muted">
          {row.num || "—"}
        </span>
        <span className="col-start-3 min-w-0 truncate text-sm">{row.title}</span>
      </button>
    </li>
  );
}
