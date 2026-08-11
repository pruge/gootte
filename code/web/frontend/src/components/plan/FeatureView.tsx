import { useEffect, useRef, useState, type DragEvent } from "react";
import { IconCheck } from "@tabler/icons-react";
import type { Feature, PlanOrder } from "@gootte/contract";
import { Empty } from "../common/states";
import { groupByTrackFeature, type FeatureLane, type TrackLane } from "./planGrouping";
import { TicketChip } from "./TicketChip";
import { isFeatureDrag, readFeatureDragData, setFeatureDragData } from "./dragPayload";
import type { OpenDocFn } from "../features/FeatureTree";

interface FeatureViewProps {
  features: readonly Feature[];
  order: PlanOrder;
  highlighted: ReadonlySet<string>;
  /** `features` 탭에서 건너왔으면 이 기능이 있는 자리로 스크롤한다(development-order/16 ④). */
  focus: string | null;
  onMoveFeature: (feature: string, track: string, beforeRank: number | null, afterRank: number | null) => void;
  /** 트랙 이름표를 고친다 — 그 트랙의 모든 기능이 한꺼번에 새 이름을 받는다(캡틴 지시 2026-08-11). */
  onRenameTrack: (track: string, newTrack: string) => void;
  /** 칩을 누르면 그 티켓 문서를 연다(development-order/15 ⑤). */
  onOpenDoc: OpenDocFn;
  /** 기능 카드를 누르면 `features` 탭 그 카드로 건너간다(development-order/16 ③). */
  onOpenFeatureCard: (feature: string) => void;
  /** 확인 필요를 그 자리에서 내린다(development-order/16 ①). */
  onDismissReview: (feature: string) => void;
}

const CARD_BASE_CLASS = "min-w-0 cursor-grab rounded-md p-2 active:cursor-grabbing";
/** 끄는 동안 보일 스타일 — 실제 드래그 미리보기(`setDragImage`)와 남는 카드 둘 다 이 값을 쓴다. */
const CARD_DRAGGING_CLASS = "border-2 border-accent bg-surface";
const CARD_RESTING_CLASS = "border border-border/60 bg-surface-2/40";

/**
 * 놓일 자리 — 가는 줄이 아니라 **공간**으로 보여준다(캡틴 피드백 2026-08-11:
 * "기능보기에서는 잘 해놓았어. 다만 한 줄로 표시하지 말고 공간으로 표시해"). 실제 기능 카드가
 * 차지할 만한 높이를 점선 테두리로 미리 비워 둔다.
 */
function DropIndicator() {
  return (
    <div className="flex h-11 min-w-0 items-center justify-center rounded-md border-2 border-dashed border-accent bg-accent/10">
      <span className="mono text-xs text-accent">여기로 이동</span>
    </div>
  );
}

/**
 * 기능 카드 하나 — 끌 수 있다(티켓 04). 위/아래 절반 중 어디를 지나는지로 놓일 자리를 정한다.
 *
 * 🔴 끄는 동안은 쉬는 상태의 옅은 배경(`bg-surface-2/40`)·옅은 테두리(`border-border/60`)를 안
 * 쓴다 — 캡틴 피드백(2026-08-11: "grab 잡힌 feature의 투명도가 너무 높아. 낮춰. border도
 * 강하게 주고", 재차: "feature는 투명도를 더 낮춰"). 남는 카드는 React state(`isDragging`)로
 * 불투명 배경·굵은 테두리를 켜지만, 그것만으로는 부족하다 — **브라우저가 직접 그리는 드래그
 * 미리보기**(포인터를 따라다니는 그 반투명 스냅샷)는 `dragstart` 이벤트가 끝나기 전에 이미
 * 캡처돼, React 가 나중에 다시 그리는 `isDragging` 스타일은 그 미리보기에 안 반영된다 — 그래서
 * 첫 시도(state 로만 배경·테두리를 바꾼 것)는 카드가 원래 자리에선 진해졌어도 정작 손가락을
 * 따라다니는 유령은 여전히 흐렸다. `dataTransfer.setDragImage()` 로 원하는 스타일을 미리 입힌
 * 복제본을 직접 넘겨야 그 유령 자체가 불투명해진다.
 *
 * 🔴 development-order/16 ③ — 이 카드는 끌어서 순위를 바꾸는 물건이면서 동시에 눌러서
 * `features` 탭으로 건너가는 물건이다. 끌고 손을 뗀 것이 클릭으로 새면 안 된다 — 15 ⑤ 가
 * 티켓 칩(`TicketChip.tsx`)에서 푼 것과 **같은** `justDraggedRef` 방식을 그대로 쓴다.
 * 두 번째 해법을 만들지 않는다.
 */
function FeatureCard({
  lane,
  highlighted,
  focused,
  onHoverHalf,
  onOpenDoc,
  onOpenFeatureCard,
  onDismissReview,
}: {
  lane: FeatureLane;
  highlighted: ReadonlySet<string>;
  focused: boolean;
  onHoverHalf: (half: "top" | "bottom") => void;
  onOpenDoc: OpenDocFn;
  onOpenFeatureCard: (feature: string) => void;
  onDismissReview: (feature: string) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const justDraggedRef = useRef(false);

  useEffect(() => {
    if (focused && typeof cardRef.current?.scrollIntoView === "function") {
      cardRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [focused]);

  function handleDragStart(e: DragEvent<HTMLDivElement>) {
    justDraggedRef.current = true;
    setIsDragging(true);
    setFeatureDragData(e, lane.feature);
    const node = cardRef.current;
    if (node && typeof e.dataTransfer.setDragImage === "function") {
      const rect = node.getBoundingClientRect();
      const ghost = node.cloneNode(true) as HTMLDivElement;
      ghost.style.position = "fixed";
      ghost.style.top = "-9999px";
      ghost.style.left = "-9999px";
      ghost.style.width = `${rect.width}px`;
      ghost.style.pointerEvents = "none";
      ghost.className = `${CARD_BASE_CLASS} ${CARD_DRAGGING_CLASS}`;
      ghost.setAttribute("data-drag-ghost", "true"); // 표시만 — 정리는 setTimeout(0), 테스트는 이 표로 찾아 치운다
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, rect.width / 2, rect.height / 2);
      setTimeout(() => ghost.remove(), 0);
    }
  }

  return (
    <div
      ref={cardRef}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={() => {
        setIsDragging(false);
        setTimeout(() => {
          justDraggedRef.current = false;
        }, 0);
      }}
      onDragOver={(e) => {
        if (!isFeatureDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = e.currentTarget.getBoundingClientRect();
        onHoverHalf(e.clientY - rect.top < rect.height / 2 ? "top" : "bottom");
      }}
      onClick={() => {
        if (justDraggedRef.current) {
          justDraggedRef.current = false;
          return;
        }
        onOpenFeatureCard(lane.feature);
      }}
      className={`${CARD_BASE_CLASS} ${isDragging ? CARD_DRAGGING_CLASS : CARD_RESTING_CLASS}`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="min-w-0 truncate text-sm font-medium">{lane.title}</span>
        <span className="mono shrink-0 text-xs text-muted">rank={lane.rank}</span>
        {lane.whyNeedsReview && (
          <span className="mono flex shrink-0 items-center gap-1 rounded bg-partial/15 px-1 py-0.5 text-xs text-partial">
            확인 필요
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation(); // 카드 클릭(건너가기)으로 새지 않게(development-order/16 ①)
                onDismissReview(lane.feature);
              }}
              className="rounded hover:bg-partial/25 focus-visible:outline-2 focus-visible:outline-accent"
              title="확인 필요를 지금 자리로 내린다"
              aria-label={`${lane.feature} 확인 필요 내리기`}
            >
              <IconCheck size={12} />
            </button>
          </span>
        )}
      </div>
      <p className="truncate text-xs text-muted" title={lane.why}>
        {lane.why}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {lane.tickets.map((t) => (
          <TicketChip
            key={t.ticketNum}
            feature={lane.feature}
            ticketNum={t.ticketNum}
            ticket={t.ticket}
            highlighted={highlighted.has(`${lane.feature}/${t.ticketNum}`)}
            whyNeedsReview={t.whyNeedsReview}
            onOpen={onOpenDoc}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * 트랙 이름표 — 누르면 고칠 수 있다(캡틴 지시 2026-08-11: "track 이름을 내가 수정 가능하게
 * 해. 이름 클릭하면 수정모드, 나가면 바로 저장되게"). 나가는 방법은 셋: blur(포커스를 다른
 * 곳으로 옮김) · Enter · Escape(취소, 원래 이름으로 되돌린다). blur·Enter 는 바뀐 값이 있을
 * 때만 저장을 부른다 — 안 바꾸고 그냥 나가면 쓰기 자체가 안 생긴다.
 */
function EditableTrackLabel({ track, onRename }: { track: string; onRename: (newTrack: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(track);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== track) onRename(trimmed);
  }

  function cancel() {
    setEditing(false);
    setDraft(track);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur(); // blur → commit()
          else if (e.key === "Escape") cancel();
        }}
        className="mono w-full rounded border border-accent bg-surface px-1 text-sm font-medium text-fg focus-visible:outline-2 focus-visible:outline-accent"
      />
    );
  }

  return (
    <h3
      role="button"
      tabIndex={0}
      onClick={() => {
        setDraft(track);
        setEditing(true);
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        setDraft(track);
        setEditing(true);
      }}
      title="눌러서 트랙 이름 고치기"
      className="mono cursor-text rounded text-sm font-medium text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
    >
      {track}
    </h3>
  );
}

/**
 * 트랙 한 칸 — 기능 카드들을 순위대로. 카드 위/아래 절반을 지나면 그 자리에 놓일 선이 보인다
 * (캡틴 확인 항목 1 — 놓을 자리가 안 보이면 짐작으로 손을 뗀다).
 */
function TrackLaneColumn({
  lane,
  highlighted,
  focus,
  onMoveFeature,
  onRenameTrack,
  onOpenDoc,
  onOpenFeatureCard,
  onDismissReview,
}: {
  lane: TrackLane;
  highlighted: ReadonlySet<string>;
  focus: string | null;
  onMoveFeature: FeatureViewProps["onMoveFeature"];
  onRenameTrack: FeatureViewProps["onRenameTrack"];
  onOpenDoc: OpenDocFn;
  onOpenFeatureCard: (feature: string) => void;
  onDismissReview: (feature: string) => void;
}) {
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  function commitDrop(e: DragEvent<HTMLElement>) {
    if (!isFeatureDrag(e)) return;
    e.preventDefault();
    const data = readFeatureDragData(e);
    const idx = dropIndex;
    setDropIndex(null);
    if (!data || idx === null) return;
    const others = lane.features.filter((f) => f.feature !== data.feature);
    const clamped = Math.min(idx, others.length);
    const before = clamped > 0 ? (others[clamped - 1]?.rank ?? null) : null;
    const after = clamped < others.length ? (others[clamped]?.rank ?? null) : null;
    onMoveFeature(data.feature, lane.track, before, after);
  }

  return (
    <section
      onDragOver={(e) => {
        if (!isFeatureDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dropIndex === null) setDropIndex(lane.features.length);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropIndex(null);
      }}
      onDrop={commitDrop}
      className={`flex min-w-0 flex-col gap-2 rounded-lg border p-3 transition-colors ${
        dropIndex !== null ? "border-accent bg-accent/5" : "border-border bg-surface"
      }`}
    >
      <EditableTrackLabel track={lane.track} onRename={(newTrack) => onRenameTrack(lane.track, newTrack)} />
      {lane.features.map((f, i) => (
        <div key={f.feature} className="flex flex-col gap-2">
          {dropIndex === i && <DropIndicator />}
          <FeatureCard
            lane={f}
            highlighted={highlighted}
            focused={f.feature === focus}
            onHoverHalf={(half) => setDropIndex(half === "top" ? i : i + 1)}
            onOpenDoc={onOpenDoc}
            onOpenFeatureCard={onOpenFeatureCard}
            onDismissReview={onDismissReview}
          />
        </div>
      ))}
      {dropIndex === lane.features.length && <DropIndicator />}
    </section>
  );
}

/**
 * 기능 보기 — 트랙이 세로줄, 그 안에 기능 카드가 순위대로(spec §두 보기).
 * 🔴 트랙을 한 줄로 펴지 않는다 — 트랙마다 자기 칸을 갖는다.
 * 카드를 끌면 순위가, 다른 트랙에 놓으면 트랙까지 바뀐다(티켓 04).
 */
export function FeatureView({
  features,
  order,
  highlighted,
  focus,
  onMoveFeature,
  onRenameTrack,
  onOpenDoc,
  onOpenFeatureCard,
  onDismissReview,
}: FeatureViewProps) {
  const lanes = groupByTrackFeature(features, order);
  if (lanes.length === 0) return <Empty>계획된 트랙이 없습니다.</Empty>;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {lanes.map((lane) => (
        <TrackLaneColumn
          key={lane.track}
          lane={lane}
          highlighted={highlighted}
          focus={focus}
          onMoveFeature={onMoveFeature}
          onRenameTrack={onRenameTrack}
          onOpenDoc={onOpenDoc}
          onOpenFeatureCard={onOpenFeatureCard}
          onDismissReview={onDismissReview}
        />
      ))}
    </div>
  );
}
