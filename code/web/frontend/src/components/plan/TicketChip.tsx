import { useRef } from "react";
import { IconEye } from "@tabler/icons-react";
import type { FeatureTicket } from "@gootte/contract";
import type { OpenDocFn } from "../features/FeatureTree";
import { setTicketDragData } from "./dragPayload";

interface TicketChipProps {
  feature: string;
  ticketNum: string;
  /** null = 계획엔 있는데 티켓 문서가 없다(`step_without_ticket` 어긋남). */
  ticket: FeatureTicket | null;
  highlighted: boolean;
  /** 드래그가 단계만 바꾸고 `why` 는 안 건드렸다는 표시(spec 04 §왜 는 안 건드린다). */
  whyNeedsReview?: boolean;
  /**
   * 끄는 동안 무엇을 끄는지 부모가 알아야 할 때(티켓 09 ③ — 다른 칸으로 끌면 기능의 트랙이
   * 바뀐다는 것을 dragover 중에 미리 알려야 한다). `dataTransfer.getData` 는 dragover 중엔
   * 못 읽으므로(브라우저 제약) 이 콜백으로 React 상태에 얹어 둔다.
   */
  onDragStart?: (feature: string, ticketNum: string) => void;
  onDragEnd?: () => void;
  /**
   * 누르면 그 티켓의 문서를 연다(development-order/15 ⑤) — `features` 탭과 같은
   * `OpenDocFn`(featureSlug, path, trigger), 같은 서랍을 그대로 부른다. 문서 없는 칩
   * (`ticket === null`)은 누르지 않는다 — "(문서 없음)" 이 이미 칩 얼굴에 적혀 있다.
   */
  onOpen?: OpenDocFn;
}

function toneClass(ticket: FeatureTicket | null, highlighted: boolean): string {
  if (highlighted) return "border-accent bg-accent/15 text-accent ring-1 ring-accent";
  if (!ticket) return "border-drop/40 bg-drop/10 text-drop";
  if (ticket.status === "done") return "border-border bg-surface-2 text-muted";
  if (ticket.status === "dropped") return "border-border bg-surface-2 text-muted line-through";
  if (ticket.status === "in_progress") return "border-active/40 bg-active/10 text-active";
  if (ticket.startable) return "border-accent/40 bg-accent/10 text-accent";
  return "border-border bg-surface text-fg";
}

/**
 * 티켓 칩 하나 — 상태는 서버가 매 요청 재계산해 보낸 값을 그대로 그린다(INV-1, 여기서 재판정 X).
 * 끌 수 있다(티켓 04) — 단계 줄 사이로, 또는 줄과 줄 사이로. 누를 수도 있다(⑤) — 문서가 열린다.
 *
 * 🔴 끌기와 누르기가 안 섞여야 한다 — 끌고 놓은 것이 클릭으로 새면 이 화면은 못 쓴다.
 * `justDraggedRef` 가 그 경계를 잡는다: `dragstart` 에서 서고, 이어지는(브라우저에 따라 뒤이어
 * 오기도 하는) `click` 을 한 번 삼킨 뒤 스스로 꺼진다. `dragend` 도 늦게(`setTimeout(0)`) 같은
 * 값을 꺼 둔다 — 클릭이 아예 안 따라오는 보통의 드래그에서도 다음 진짜 클릭이 막히지 않게.
 *
 * 🔴 `draggable` 은 `onDragStart` 를 받았을 때만 켠다(단계 보기 — 티켓 칩 자체를 끈다, 티켓 04).
 * 기능 보기에서는 이 칩이 `FeatureCard`(기능 카드 전체가 `draggable`) 안에 얹힌다 — 칩까지
 * 같이 `draggable` 이면 HTML5 드래그는 포인터 아래 **가장 안쪽** draggable 에서 시작해, 기능 카드를
 * 끌려 해도 칩 하나만 끌리는 티켓 드래그가 튀어나온다(캡틴 피드백 2026-08-11: "잡힌 것도 feature로
 * 표시되어야 하는데 ticket으로 보인다"). `onDragStart` 미전달 = 칩은 끌리지 않고, 감싼 기능 카드의
 * `draggable` 이 그대로 이긴다.
 */
export function TicketChip({
  feature,
  ticketNum,
  ticket,
  highlighted,
  whyNeedsReview,
  onDragStart,
  onDragEnd,
  onOpen,
}: TicketChipProps) {
  const justDraggedRef = useRef(false);
  const draggableForTicket = onDragStart !== undefined;

  return (
    <span
      draggable={draggableForTicket}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen && ticket ? 0 : undefined}
      onDragStart={(e) => {
        if (!draggableForTicket) return;
        justDraggedRef.current = true;
        setTicketDragData(e, feature, ticketNum);
        onDragStart?.(feature, ticketNum);
      }}
      onDragEnd={() => {
        onDragEnd?.();
        setTimeout(() => {
          justDraggedRef.current = false;
        }, 0);
      }}
      onClick={(e) => {
        // 기능 보기에서는 이 칩이 기능 카드(그 자체가 누르면 건너가는 물건, development-order/16
        // ③) 안에 얹힌다 — 칩 클릭이 카드까지 새면 문서 대신 다른 탭으로 건너가 버린다.
        e.stopPropagation();
        if (justDraggedRef.current) {
          justDraggedRef.current = false;
          return;
        }
        if (!ticket) return; // 문서 없음 — 빈 서랍을 열지 않는다(이미 "(문서 없음)" 이 적혀 있다)
        onOpen?.(feature, `issues/${ticket.slug}.md`, e.currentTarget);
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.stopPropagation();
        if (!ticket) return;
        e.preventDefault();
        onOpen?.(feature, `issues/${ticket.slug}.md`, e.currentTarget);
      }}
      title={ticket ? ticket.title : `${feature}/${ticketNum} — 티켓 문서를 찾지 못함(어긋남)`}
      className={`mono flex max-w-full min-w-0 cursor-grab flex-col gap-0.5 rounded-md border px-2 py-1 text-sm active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-accent ${toneClass(ticket, highlighted)}`}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 truncate">
          {feature}/{ticketNum}
        </span>
        {ticket?.needsCaptainEye && (
          <IconEye
            size={13}
            className="shrink-0 text-partial"
            aria-label="캡틴 확인 필요"
          />
        )}
        {whyNeedsReview && (
          <span className="mono shrink-0 rounded bg-partial/15 px-1 py-0.5 text-xs text-partial">확인 필요</span>
        )}
      </span>
      {/* 🔴 설명은 말줄임으로 줄이지 않는다 — 이름과 줄을 바꿔, 필요한 만큼 여러 줄로 그대로 보여준다. */}
      <span className="min-w-0 whitespace-normal break-words text-fg/80">
        {ticket ? ticket.title : "(문서 없음)"}
      </span>
    </span>
  );
}
