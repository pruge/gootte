import {
  IconAlertTriangle,
  IconCircleCheckFilled,
  IconCircleDashed,
  IconCircleX,
  IconLock,
  IconProgress,
} from "@tabler/icons-react";
import type { FeatureTicket } from "@gootte/contract";

/**
 * 상태 아이콘 — semantic(장식 아님). 처리중 = active(작업중 신호), 착수 가능 = accent, 기다리는 중 = muted.
 * 원문 상태(`sourceStatus`)는 아이콘으로 뭉개지 않고 옆에 그대로 띄운다(결정 Q3).
 */
function StateIcon({ ticket }: { ticket: FeatureTicket }) {
  if (ticket.status === "done")
    return <IconCircleCheckFilled size={17} className="shrink-0 text-accent" />;
  if (ticket.status === "dropped") return <IconCircleX size={17} className="shrink-0 text-muted" />;
  if (ticket.status === "in_progress")
    return <IconProgress size={17} className="shrink-0 text-active" />;
  return ticket.startable ? (
    <IconCircleDashed size={17} className="shrink-0 text-accent" />
  ) : (
    <IconLock size={17} className="shrink-0 text-muted" />
  );
}

/**
 * 티켓 한 줄 — 번호 · 제목 · **원문 상태** · 막힘/착수 가능(계산) · 처리중(격리 사본 관측).
 *
 * 🔴 상태를 못 읽은 티켓을 숨기지 않는다. 숨기면 화면이 "할 일이 없다" 고 거짓말한다 —
 * 대신 무엇이 이상한지(원문 문자열)를 드러낸다.
 * 처리중은 문서에 없는 값이라 원문 상태 옆에 **따로** 붙는다(뭉개지 않는다).
 */
export function TicketRow({ ticket }: { ticket: FeatureTicket }) {
  // 처리중이어도 선행이 남아 있으면 그 사실은 계속 보인다 — 관측이 계산을 덮어쓰지 않는다.
  const open = ticket.status === "pending" || ticket.status === "in_progress";
  const waiting = !ticket.startable && open;

  return (
    <li
      className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 px-4 py-2.5 ${
        ticket.status === "done" || ticket.status === "dropped" ? "text-muted" : ""
      }`}
    >
      <StateIcon ticket={ticket} />
      <span className="mono shrink-0 text-sm tabular-nums text-muted">{ticket.num || "—"}</span>
      <span
        className={`min-w-0 flex-1 truncate ${waiting && ticket.status === "pending" ? "text-muted" : ""}`}
      >
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

      {ticket.status === "in_progress" && (
        // 처리중은 상태가 정한다(workedBy 존재만으로 그리지 않는다) — 어느 가지가 붙들고 있는지 verbatim 으로 싣는다.
        <span
          className="mono flex shrink-0 items-center gap-1 rounded bg-active/15 px-1.5 py-0.5 text-sm text-active"
          title={`작업 가지: ${ticket.workedBy.join(", ")}`}
        >
          <IconProgress size={13} />
          처리중 · {ticket.workedBy.join(", ")}
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
