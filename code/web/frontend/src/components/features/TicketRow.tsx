import {
  IconAlertTriangle,
  IconCircleCheckFilled,
  IconCircleDashed,
  IconCircleX,
  IconLock,
  IconProgress,
} from "@tabler/icons-react";
import type { FeatureConflict, FeatureTicket } from "@gootte/contract";
import { BACKLOG_STATUS_LABEL } from "../../lib/backlogStatusLabel";
import { ConflictBadge } from "./ConflictBadge";
import { TICKET_LIST_DEPTH, treeIndentStyle } from "../../lib/tree-indent";
import { triggerKey } from "./docTrigger";
import { UnlandedBadge } from "./FeatureTree";
import type { OpenDocFn } from "./FeatureTree";
import { HighlightedText } from "./HighlightedText";

/** 트리 나머지가 쓰는 문서 아이콘 폭(15px) — 상태 아이콘도 여기 맞춘다(F20). 뜻·색은 그대로다. */
const STATE_ICON_SIZE = 15;

/**
 * T04 — `tickets/` 신관례인데 백로그에 조인되지 않은 티켓. 파일에 상태가 없으므로 이 경우는
 * "모른다" 지 "착수 가능" 이 아니다 — 조인 실패 시 상태를 안 보여주는 것이 정답이다
 * (T04 §구현 원칙, 추측 금지).
 */
function isUnjoinedNewTicket(ticket: FeatureTicket): boolean {
  return ticket.docConvention === "tickets" && !ticket.backlogStatus;
}

/**
 * 상태 아이콘 — semantic(장식 아님). 처리중 = active(작업중 신호), 착수 가능 = accent, 기다리는 중 = muted.
 * 원문 상태(`sourceStatus`)는 아이콘으로 뭉개지 않고 옆에 그대로 띄운다(결정 Q3).
 */
function StateIcon({ ticket }: { ticket: FeatureTicket }) {
  if (isUnjoinedNewTicket(ticket))
    return <IconCircleDashed size={STATE_ICON_SIZE} className="shrink-0 text-muted" />;
  if (ticket.status === "done")
    return <IconCircleCheckFilled size={STATE_ICON_SIZE} className="shrink-0 text-accent" />;
  if (ticket.status === "dropped")
    return <IconCircleX size={STATE_ICON_SIZE} className="shrink-0 text-muted" />;
  if (ticket.status === "in_progress")
    return <IconProgress size={STATE_ICON_SIZE} className="shrink-0 text-active" />;
  return ticket.startable ? (
    <IconCircleDashed size={STATE_ICON_SIZE} className="shrink-0 text-accent" />
  ) : (
    <IconLock size={STATE_ICON_SIZE} className="shrink-0 text-muted" />
  );
}

/**
 * 단계 칸의 값 — 셋 중 하나거나(착수 가능·진행중·대기) 아예 없다(끝났거나 취소됐다, 또는
 * 신관례인데 백로그 미조인 — 모르는 것을 "착수 가능" 으로 보여주지 않는다, T04).
 * 🔴 "임자만 있고 실제로는 안 도는" 티켓(claimed 인데 붙든 사본이 없음)은 여기 넷째 값으로
 * 끼워 넣지 않는다 — `waitingOn` 이 비었는데도 `startable` 이 false 인 경우가 바로 그 경우고,
 * 그건 이 칸이 아니라 "임자 없이 남은 표시"(FeaturesView)가 따로 드러낸다
 * (ticket-row-repair/03 §🟢 넷째 값은 필요 없다).
 */
type Stage = "startable" | "in_progress" | "waiting" | null;

function stageOf(ticket: FeatureTicket): Stage {
  if (isUnjoinedNewTicket(ticket)) return null;
  if (ticket.status === "done" || ticket.status === "dropped") return null;
  if (ticket.status === "in_progress") return "in_progress";
  if (ticket.waitingOn.length > 0) return "waiting";
  return ticket.startable ? "startable" : null;
}

const STAGE_LABEL: Record<Exclude<Stage, null>, string> = {
  startable: "착수 가능",
  in_progress: "진행중",
  waiting: "대기",
};

const STAGE_CLASS: Record<Exclude<Stage, null>, string> = {
  startable: "text-accent",
  in_progress: "text-active",
  waiting: "text-muted",
};

/**
 * 티켓 한 줄 — 번호 · 제목 · **원문 상태** · 단계(계산) · 완료일 · 딸린 상세.
 *
 * 🔴 상태를 못 읽은 티켓을 숨기지 않는다. 숨기면 화면이 "할 일이 없다" 고 거짓말한다 —
 * 대신 무엇이 이상한지(원문 문자열)를 드러낸다.
 * 처리중은 문서에 없는 값이라 원문 상태 옆에 **따로** 붙는다(뭉개지 않는다).
 *
 * 단계 칸과 완료일 칸은 값이 없어도 자리를 지킨다(같은 너비의 빈 칸) — 그 뒤에 오는
 * **가지 이름 · 기다리는 대상**(딸린 상세)만 줄마다 폭이 다르고, 맨 끝에 있어 고정 칸을 밀지 않는다
 * (ticket-row-repair/03).
 *
 * 🔴 줄 전체가 버튼이다 — 누르면(또는 키보드로) `ticket.path`(서버가 준 경로, 화면이 조립하지
 * 않는다) 로 드로어가 열린다(feature-doc-browser/04). 문서 트리 파일 줄과 같은 방식이다.
 */
export function TicketRow({
  ticket,
  featureSlug,
  onOpenDoc,
  query = "",
  conflict,
}: {
  ticket: FeatureTicket;
  featureSlug: string;
  onOpenDoc: OpenDocFn;
  /** 검색어 — 이 티켓이 검색으로 걸렸다면 걸린 자리를 노란 칩으로 보여준다. */
  query?: string;
  /** T03 — 이 티켓 파일이 갈라졌으면 그 사실(어느 사본들인지). 없으면 갈라지지 않았다. */
  conflict?: FeatureConflict;
}) {
  const stage = stageOf(ticket);
  const unread = ticket.unread === true;

  return (
    <li>
      <button
        type="button"
        style={treeIndentStyle(TICKET_LIST_DEPTH)}
        data-doc-trigger={triggerKey({ featureSlug, path: ticket.path })}
        onClick={(e) => onOpenDoc(featureSlug, ticket.path, e.currentTarget)}
        className={`flex w-full items-center gap-2 pr-4 py-2.5 text-left ${
          unread ? "bg-unread hover:bg-unread-strong" : "hover:bg-surface-2/60"
        } ${ticket.status === "done" || ticket.status === "dropped" ? "text-muted" : ""}`}
      >
        <StateIcon ticket={ticket} />
        <span className="mono shrink-0 text-sm tabular-nums text-muted">{ticket.num || "—"}</span>
        <span className="min-w-0 flex-1 truncate">
          <HighlightedText text={ticket.title} query={query} />
        </span>

        {/* 우측 고정 컬럼들 */}
        <span className="flex items-center gap-2 shrink-0">
          {unread && (
            <span
              role="status"
              className="mono shrink-0 rounded bg-unread-strong px-1.5 py-0.5 text-sm font-medium text-unread-fg"
            >
              안 읽음
            </span>
          )}
          {ticket.unlanded && <UnlandedBadge />}
          {conflict && <ConflictBadge conflicts={[conflict]} />}

          {/* 상태 배지 — 고정 폭, 우측 정렬 */}
          <span className="mono inline-block w-[16ch] shrink-0 text-sm text-right text-muted">
            {(() => {
              if (ticket.docConvention === "tickets") {
                return ticket.backlogStatus
                  ? BACKLOG_STATUS_LABEL[ticket.backlogStatus] ?? ticket.backlogStatus
                  : "";
              } else if (ticket.statusKnown) {
                return ticket.sourceStatus ?? "";
              } else {
                return (
                  <span
                    role="status"
                    className="mono flex items-center gap-1 rounded bg-drop/15 px-1.5 py-0.5 text-sm text-drop"
                    title="정규 아홉 값이 아닙니다"
                  >
                    <IconAlertTriangle size={13} />
                    {ticket.sourceStatus === null
                      ? "상태 줄 없음"
                      : `알 수 없는 상태: ${ticket.sourceStatus}`}
                  </span>
                );
              }
            })()}
          </span>

          {/* 단계/완료일 — 고정 폭, 좌측 정렬, 상태 배지와 간격 확보 */}
          {(() => {
            const doneAt = ticket.completedAt;
            const hasElapsed = ticket.elapsed && doneAt;
            if (doneAt) {
              return (
                <span
                  className="mono inline-block w-[18ch] shrink-0 ml-4 text-sm text-left text-muted"
                  title={hasElapsed ? `소요: ${ticket.elapsed}` : undefined}
                >
                  {doneAt}
                </span>
              );
            }
            if (stage) {
              return (
                <span className="mono inline-block w-[18ch] shrink-0 ml-4 text-sm text-left text-muted">
                  <span className={STAGE_CLASS[stage]}>{STAGE_LABEL[stage]}</span>
                </span>
              );
            }
            return (
              <span className="mono inline-block w-[18ch] shrink-0 ml-4 text-sm text-left text-muted invisible">
                0000-00-00 00:00
              </span>
            );
          })()}

          {stage === "in_progress" && (
            <span
              className="mono max-w-[12ch] truncate text-sm text-active"
              title={`작업 가지: ${ticket.workedBy.join(", ")}`}
            >
              {ticket.workedBy.join(", ")}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
