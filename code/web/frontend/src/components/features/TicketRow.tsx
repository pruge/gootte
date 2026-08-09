import {
  IconAlertTriangle,
  IconCircleCheckFilled,
  IconCircleDashed,
  IconCircleX,
  IconLock,
} from "@tabler/icons-react";
import type { FeatureTicket } from "@gootte/contract";

/**
 * 상태 아이콘 — semantic(장식 아님). 착수 가능 = accent, 기다리는 중 = muted.
 * 원문 상태(`sourceStatus`)는 아이콘으로 뭉개지 않고 옆에 그대로 띄운다(결정 Q3).
 */
function StateIcon({ ticket }: { ticket: FeatureTicket }) {
  if (ticket.status === "done")
    return <IconCircleCheckFilled size={17} className="shrink-0 text-accent" />;
  if (ticket.status === "dropped") return <IconCircleX size={17} className="shrink-0 text-muted" />;
  return ticket.startable ? (
    <IconCircleDashed size={17} className="shrink-0 text-accent" />
  ) : (
    <IconLock size={17} className="shrink-0 text-muted" />
  );
}

/**
 * 티켓 한 줄 — 번호 · 제목 · **원문 상태** · 막힘/착수 가능(계산).
 *
 * 🔴 상태를 못 읽은 티켓을 숨기지 않는다. 숨기면 화면이 "할 일이 없다" 고 거짓말한다 —
 * 대신 무엇이 이상한지(원문 문자열)를 드러낸다.
 */
export function TicketRow({ ticket }: { ticket: FeatureTicket }) {
  const waiting = !ticket.startable && ticket.status === "pending";

  return (
    <li
      className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 px-4 py-2.5 ${
        ticket.status === "done" || ticket.status === "dropped" ? "text-muted" : ""
      }`}
    >
      <StateIcon ticket={ticket} />
      <span className="mono shrink-0 text-sm tabular-nums text-muted">{ticket.num || "—"}</span>
      <span className={`min-w-0 flex-1 truncate ${waiting ? "text-muted" : ""}`}>
        {ticket.title}
      </span>

      {ticket.statusKnown ? (
        <span className="mono shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-sm text-muted">
          {ticket.sourceStatus}
        </span>
      ) : (
        // 알 수 없는 상태 = 조용히 버리는 대신 눈에 띄게. 원문을 그대로 보여준다(INV-4 릴레이).
        <span
          role="status"
          className="mono flex shrink-0 items-center gap-1 rounded bg-drop/15 px-1.5 py-0.5 text-sm text-drop"
          title="정규 여덟 값이 아닙니다"
        >
          <IconAlertTriangle size={13} />
          {ticket.sourceStatus === null
            ? "상태 줄 없음"
            : `알 수 없는 상태: ${ticket.sourceStatus}`}
        </span>
      )}

      {ticket.completedAt && (
        <span className="mono shrink-0 text-sm tabular-nums text-muted">{ticket.completedAt}</span>
      )}

      {waiting ? (
        // 번호로 해소되지 않은 선행(다른 기능을 가리키는 문구 등)도 그대로 보인다 — verbatim 릴레이(INV-4).
        <span
          className="mono max-w-full truncate text-sm text-muted"
          title={ticket.waitingOn.join(", ")}
        >
          대기 → {ticket.waitingOn.join(", ")}
        </span>
      ) : (
        ticket.status === "pending" && (
          <span className="mono shrink-0 text-sm text-accent">착수 가능</span>
        )
      )}
    </li>
  );
}
