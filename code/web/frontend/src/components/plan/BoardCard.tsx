import type { KeyboardEvent, MouseEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IconArrowMoveRight, IconFileText } from "@tabler/icons-react";
import type { PlanCard } from "@gootte/contract";
import { closedDisplayAt } from "@gootte/core/plan";
import { featureDescription } from "./cardTitle";

export interface BoardCardProps {
  card: PlanCard;
  /** 이 카드가 완료 칸에 있는가 — 닫힌 시각을 보여줄지 판단하는 데만 쓴다(06). 어느 칸에 담겨
   * 있는지는 카드 자신이 모른다(`PlanCard` 는 `area` 를 싣지 않는다) — 호출자(`CardList`)가 안다. */
  closed?: boolean;
  /** 여러 장 고르기 — 고른 카드는 테두리로 드러나고, 그중 하나를 끌면 전부 따라간다. */
  selected?: boolean;
  /** 머리글을 ⌘/Ctrl/Shift 와 함께 누른 것 — 여는 대신 고른다. */
  onToggleSelect?: (slug: string) => void;
  /** 머리글을 그냥 누른 것 — 티켓 목록을 대화상자로 연다(캡틴 결정). */
  onOpenCard?: (slug: string) => void;
  /** 문서 아이콘 — `features` 탭의 기존 통로로 간다(두 번째 문서 보기를 짓지 않는다). */
  onOpenDoc?: (slug: string) => void;
  /** 이동 아이콘 — "어느 칸으로 보낼까요" 대화상자. */
  onRequestMove?: (slug: string) => void;
  /** 끌기 오버레이용 사본 — 끌기 배선 없이 모양만 그린다. */
  overlay?: boolean;
}

/**
 * 판 위의 카드 하나 — **머리만 보인다.** 머리글을 누르면 티켓 목록이 **대화상자로** 열린다
 * (캡틴 결정 2026-08-12: "영역이 작으니 한번에 보기 힘들다 … dialog 로 떠서 카드를 펼쳐서
 * 보여준다. 확인을 누르면 닫히게 하자"). 무엇이 열려 있는지는 **화면의 상태**이지 저장하지 않는다.
 *
 * 🔴 여기 보이는 것은 전부 **문서에서 온 것**이다(INV-5) — 제목도, 티켓 번호·제목·상태도.
 * 계획 DB 가 아는 것은 이 카드가 어느 칸에 있는가와 그 순서뿐이라, 둘이 갈라질 수 없다.
 *
 * 🔴 접힌 카드도 **티켓 수는 머리에 이고 있다** — 감추면 카드가 제 크기를 말하지 않게 되고,
 * 캡틴이 판을 훑는 동안 하나하나 열어 봐야 한다.
 *
 * 머리글은 `role="button"` div **하나**다 — 진짜 `<button>` 을 쓰지 않는 이유는 아이콘 둘을
 * **설명문 줄 안에** 앉히기 위해서다(캡틴 지시: 아이콘이 따로 칸을 잡아 낭비하지 않게). 아이콘은
 * 진짜 `<button>` 인데, 진짜 버튼 안에 버튼을 넣는 것은 무효 HTML 이라(features 탭 `FeatureCard`
 * 와 같은 규율), 머리글 쪽을 `role="button"` div 로 내려 그 안에 아이콘 버튼을 정상적으로 품는다.
 * 클릭·Enter·Space 는 손으로 배선한다(`onHeaderClick`·`onHeaderKeyDown`).
 *
 * 끌기는 카드 전체가 손잡이다(03). 6px 움직여야 끌기로 치므로 머리글 단추와 아이콘 둘은 그대로
 * 눌린다 — 따로 손잡이 아이콘을 세우지 않는다(캡틴이 정한 아이콘은 둘뿐이다).
 *
 * 🔴 티켓 줄의 상자(04)는 **저장된 값이 아니다** — 문서 상태 한 칸에서 계산한다(`ticketChecked`,
 * core). 작업자가 문서를 완료로 바꾸면 아무도 gootte 에 알리지 않아도 다음 read 에서 채워진다.
 * 화면은 판정하지 않고 core 의 판정을 그대로 그린다(spec §판정 자리는 하나뿐).
 */
export function BoardCard({
  card,
  closed = false,
  selected = false,
  onToggleSelect,
  onOpenCard,
  onOpenDoc,
  onRequestMove,
  overlay = false,
}: BoardCardProps) {
  const { feature } = card;
  const headingId = `board-card-${feature.slug}`;
  // 표제 앞에 겹쳐 붙은 기능 이름은 뗀다 — 같은 이름이 한 카드에 두 번 뜨지 않게(캡틴 결정).
  const description = featureDescription(feature.title, feature.slug);
  // 완료 칸 카드가 보여줄 닫힌 시각 하나 — 저절로 닫혔으면 문서에서, 손으로 닫았으면 저장값에서
  // (core `closedDisplayAt`, 06). 완료 칸이 아닌 카드에는 묻지 않는다 — 부분 완료 날짜를 "닫힘"으로
  // 잘못 읽지 않기 위해서다.
  const closedDisplay = closed ? closedDisplayAt(card.closedAt, feature) : null;
  // 안 읽은 티켓이 하나라도 있는가 — 이미 실려 온 값을 쓴다(unread-tickets-show-themselves/03,
  // `features` 탭 머리글과 같은 판정, 여기서 다시 세지 않는다). 완료 칸의 카드에도 그대로 선다.
  const hasUnread = feature.hasUnreadTicket === true;

  // 🔴 `role` 을 카드 자신의 것으로 못 박는다 — dnd-kit 기본값(`button`)이 붙으면 카드가
  // 카드가 아니게 되고, 안에 있는 머리글 버튼이 버튼 속 버튼이 된다.
  //
  // 🔴 `animateLayoutChanges: false` — 카드가 **제자리에 그냥 나타난다**(캡틴 지시).
  // dnd-kit 기본값은 자리 이동을 옛 측정값에서 새 자리로 미끄러뜨리는데, 다른 칸에서 온 카드는
  // 옛 측정값이 저 멀리라 화면 왼쪽에서 날아 들어오는 것처럼 보인다. 놓은 자리에서 제자리로
  // 가는 연출은 손끝의 사본(`DragOverlay`)이 맡는다 — 두 연출이 겹치면 어디서 온 건지 알 수 없다.
  const sortable = useSortable({
    id: feature.slug,
    disabled: overlay,
    animateLayoutChanges: () => false,
    attributes: { role: "article", roleDescription: "카드 — 끌어서 다른 칸으로 옮깁니다" },
  });

  const onHeaderClick = (e: MouseEvent<HTMLDivElement>) => {
    if (onToggleSelect && (e.metaKey || e.ctrlKey || e.shiftKey)) {
      onToggleSelect(feature.slug);
      return;
    }
    onOpenCard?.(feature.slug);
  };

  // `role="button"` div 는 Enter/Space 를 저절로 안 만든다(진짜 `<button>` 과 달리) — 직접 배선한다.
  const onHeaderKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    onOpenCard?.(feature.slug);
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
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        onClick={onHeaderClick}
        onKeyDown={onHeaderKeyDown}
        className={`grid w-full cursor-[inherit] grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-0.5 px-3 py-2 text-left ${
          hasUnread ? "bg-unread" : "bg-surface-2/50"
        }`}
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
            <span className="col-start-1 row-start-2 min-w-0 font-medium tracking-tight break-words">
              {description}
            </span>
          )}
        </h3>
        {/* 🔴 오른쪽 끝을 아이콘 줄과 맞춘다 — 아이콘 칸(다음 줄)이 이 칸의 폭을 정하므로
            (같은 격자 열), 이 텍스트를 왼쪽에 그냥 두면 아이콘 오른쪽 끝보다 짧아 어긋나 보인다.
            🔴 `pr-1.5` 는 장식이 아니다 — 아이콘 버튼 자신의 패딩(`p-1.5`)만큼 클릭 상자가 눈에
            보이는 그림보다 오른쪽으로 더 나가 있어, 상자 끝(칸의 오른쪽 끝)에 맞추면 오히려
            "이동" 아이콘의 실제 화살표보다 티켓 수가 더 오른쪽으로 삐져나와 보인다. 같은 폭만큼
            물러나 **눈에 보이는 아이콘 끝**과 맞춘다.
            🔴 이 전제는 "아이콘 칸이 항상 이 칸보다 넓다" 를 깔고 있었다 — `안 읽음` 표시
            (unread-tickets-show-themselves/03)가 이 줄에 더해지면서 이 줄이 아이콘 줄보다
            넓어질 수 있게 됐고, 그러면 격자 열 폭이 이 줄에 끌려가 아이콘 줄(아래, `justify-end`
            없음)이 왼쪽으로 붙어 어긋나 보인다. 아이콘 줄에도 `justify-end` 를 주어 어느 줄이
            더 넓어지든 항상 같은 오른쪽 끝을 본다. */}
        <span className="col-start-2 row-start-1 flex shrink-0 items-baseline justify-end gap-x-2.5 pr-1.5">
          {hasUnread && (
            // 색 말고도 붙들 것이 있다(INV-U2) — `features` 탭 머리글과 같은 표시.
            <span
              role="status"
              className="mono shrink-0 rounded bg-unread-strong px-1.5 py-0.5 text-sm font-medium text-unread-fg"
            >
              안 읽음
            </span>
          )}
          <span className="mono text-sm tabular-nums text-muted">
            티켓 {feature.tickets.length}
          </span>
        </span>

        {/* 🔴 아이콘 **둘** — 캡틴 제안 9, 캡틴 지시로 설명문 줄에 앉는다(따로 칸을 잡던 것을
            없앤다). 설명이 없는 기능도 이 자리(둘째 줄)에 그대로 선다 — 자리가 하나로 고정된다.
            클릭이 머리글로 새면 다이얼로그가 함께 열리므로 stopPropagation, 끌기로 새면 손잡이가
            반응하므로 pointerdown 도 함께 멈춘다. */}
        {!overlay && (
          <div
            className="col-start-2 row-start-2 flex shrink-0 items-start justify-end gap-0.5"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDoc?.(feature.slug);
              }}
              aria-label={`${feature.slug} 문서 열기`}
              title="features 탭에서 이 기능 문서를 연다"
              className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              <IconFileText size={17} stroke={1.6} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRequestMove?.(feature.slug);
              }}
              aria-label={`${feature.slug} 다른 칸으로 보내기`}
              title="어느 칸으로 보낼지 고른다"
              className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              <IconArrowMoveRight size={17} stroke={1.6} />
            </button>
          </div>
        )}

        {/* 닫힌 시각 하나 — 저절로 닫혔으면 문서가 말하는 완료 시각, 손으로 닫았으면 저장값
            그대로다(06). 판정은 `closedDisplayAt`(core) 하나뿐, 화면은 받아 쓰기만 한다.
            닫힌 카드에만 뜨고, 첫 줄 옆이 아니라 제 줄을 갖는다 — 짧은 이름 줄의 여백을
            설명 줄에서 빼앗지 않기 위해서다(위 격자 설명과 같은 이유). */}
        {closedDisplay && (
          <span className="mono col-span-2 col-start-1 row-start-3 text-sm tabular-nums text-muted">
            닫힘 {closedDisplay}
          </span>
        )}
      </div>
    </article>
  );
}
