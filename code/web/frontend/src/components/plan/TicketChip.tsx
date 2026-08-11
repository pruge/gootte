import type { FeatureTicket } from "@gootte/contract";
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
 * 끌 수 있다(티켓 04) — 단계 줄 사이로, 또는 줄과 줄 사이로.
 */
export function TicketChip({
  feature,
  ticketNum,
  ticket,
  highlighted,
  whyNeedsReview,
  onDragStart,
  onDragEnd,
}: TicketChipProps) {
  return (
    <span
      draggable
      onDragStart={(e) => {
        setTicketDragData(e, feature, ticketNum);
        onDragStart?.(feature, ticketNum);
      }}
      onDragEnd={() => onDragEnd?.()}
      title={ticket ? ticket.title : `${feature}/${ticketNum} — 티켓 문서를 찾지 못함(어긋남)`}
      className={`mono flex max-w-full min-w-0 cursor-grab flex-col gap-0.5 rounded-md border px-2 py-1 text-sm active:cursor-grabbing ${toneClass(ticket, highlighted)}`}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 truncate">
          {feature}/{ticketNum}
        </span>
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
