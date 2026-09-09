import {
  IconFlag,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerTrackNext,
} from "@tabler/icons-react";
import type { Feature, FeatureTicket } from "@gootte/contract";
import { useHoverTip } from "../HoverTip";

/** 상자 글리프 — `[x]`/`[-]`/`[ ]` 는 문서 상태에서 이미 계산된 `ticket.status` 로 그린다. */
function boxGlyph(t: FeatureTicket): string {
  if (t.status === "done") return "[x]";
  if (t.status === "dropped") return "[-]";
  return "[ ]";
}

function rowTone(t: FeatureTicket): string {
  const pausedNow = t.pauses?.some((p) => p.resumedAt === null) === true;
  if (t.unread === true) return "bg-unread hover:bg-unread-strong";
  if (pausedNow) return "bg-paused hover:bg-paused-strong";
  return t.status === "in_progress"
    ? "bg-inprogress hover:bg-inprogress-strong"
    : "hover:bg-surface-2";
}

export function TicketLine({
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
              {pausedNow ? "일시중단" : "처리중"}
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
