import {
  IconAlertTriangle,
  IconCircleCheckFilled,
  IconCircleDashed,
  IconCircleX,
  IconLock,
  IconProgress,
} from "@tabler/icons-react";
import type { FeatureConflict, FeatureTicket } from "@gootte/contract";
import { ConflictBadge } from "./ConflictBadge";
import { TICKET_LIST_DEPTH, treeIndentStyle } from "../../lib/tree-indent";
import { triggerKey } from "./docTrigger";
import { UnlandedBadge } from "./FeatureTree";
import type { OpenDocFn } from "./FeatureTree";
import { HighlightedText } from "./HighlightedText";
import { useHoverTip } from "../HoverTip";

/** 트리 나머지가 쓰는 문서 아이콘 폭(15px) — 상태 아이콘도 여기 맞춘다(F20). 뜻·색은 그대로다. */
const STATE_ICON_SIZE = 15;

/**
 * T04 — `tickets/` 신관례인데 백로그에 조인되지 않은 티켓. 파일에 상태가 없으므로 이 경우는
 * "모른다" 지 "착수 가능" 이 아니다 — 조인 실패 시 상태를 안 보여주는 것이 정답이다
 * (T04 §구현 원칙, 추측 금지).
 */
function isUnjoinedNewTicket(ticket: FeatureTicket): boolean {
  return ticket.docConvention === "tickets" && ticket.joinFailed === true;
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
 * 단계 칸 — 값이 없어도 늘 그린다. 세 후보를 **같은 칸에 겹쳐** 렌더링해 안 보이는 것까지
 * 폭 계산에 넣는다 — 글자 수로 셈하지 않고 실제로 그려지는 폭 중 가장 넓은 것을 칸이 갖는다
 * (완료일 칸과 같은 원리, 다만 셋의 글자 수가 서로 달라 같은 트릭을 그대로는 못 써 grid 로 겹친다).
 * 값이 없으면(끝남·취소) 셋 다 안 보이는 채로 칸만 남는다 — 대체 문자를 넣지 않는다.
 */
function StageCell({ stage }: { stage: Stage }) {
  return (
    <span className="mono grid shrink-0 text-sm">
      {(Object.keys(STAGE_LABEL) as Exclude<Stage, null>[]).map((key) => (
        <span
          key={key}
          className={`col-start-1 row-start-1 ${STAGE_CLASS[key]} ${stage === key ? "" : "invisible"}`}
        >
          {STAGE_LABEL[key]}
        </span>
      ))}
    </span>
  );
}

/**
 * 완료 시점부터의 경과 표시 — 7일 이내는 "N분/시간/일 전"(방금 포함),
 * 넘기면 절댓값 날짜(YYYY-MM-DD)로 바꾼다(read-path 계산, INV-4).
 * 파싱이 안 되거나 미래 시각이면 원문을 그대로(지어내지 않는다).
 */
function formatCompleted(at: string): string {
  const ms = Date.parse(at.includes(" ") ? at.replace(" ", "T") : at);
  if (Number.isNaN(ms)) return at;
  const diff = Date.now() - ms;
  const DAY = 86400000;
  if (diff < 0) return at;
  if (diff < DAY * 7) {
    if (diff < 60000) return "방금";
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}분 전`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}시간 전`;
    return `${Math.floor(hrs / 24)}일 전`;
  }
  return at.length >= 10 ? at.slice(0, 10) : at;
}

/**
 * 티켓 한 줄 — 번호 · 제목 · **원문 상태** · 단계(계산) · 완료일 · 딸린 상세.
 *
 * 🔴 상태를 못 읽은 티켓을 숨기지 않는다. 숨기면 화면이 "할 일이 없다" 고 거짓말한다 —
 * 대신 무엇이 이상한지(원문 문자열)를 드러낸다.
 * 처리중은 문서에 없는 값이라 원문 상태 옆에 **따로** 붙는다(뭉개지 않는다).
 *
 * 단계/완료 한 칸은 값이 없어도 자리를 지킨다(같은 너비의 빈 칸) — 그 뒤에 오는
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
  // T02(a-ticket-tells-how-long-it-took) — 걸린 시간 어림 문구를 hover 툴팁으로(ProcessView 와 동일 모양).
  // 시간이 없으면 툴팁을 띄우지 않는다(INV-4 — 값이 없으면 아무것도 안 보여준다).
  const tipLabel = ticket.elapsed ?? null;
  const { triggerProps, tip } = useHoverTip(tipLabel);

  return (
    <li>
      <button
        type="button"
        {...triggerProps}
        style={treeIndentStyle(TICKET_LIST_DEPTH)}
        data-doc-trigger={triggerKey({ featureSlug, path: ticket.path })}
        onClick={(e) => onOpenDoc(featureSlug, ticket.path, e.currentTarget)}
        className={`flex w-full flex-wrap items-center gap-x-2.5 gap-y-1 pr-4 py-2.5 text-left ${
          unread ? "bg-unread hover:bg-unread-strong" : "hover:bg-surface-2/60"
        } ${ticket.status === "done" || ticket.status === "dropped" ? "text-muted" : ""}`}
      >
        <StateIcon ticket={ticket} />
        <span className="mono shrink-0 text-sm tabular-nums text-muted">{ticket.num || "—"}</span>
        <span className={`min-w-0 flex-1 truncate ${stage === "waiting" ? "text-muted" : ""}`}>
          <HighlightedText text={ticket.title} query={query} />
        </span>

        {unread && (
          // 색 말고도 붙들 것이 있다(INV-U2) — 보조기술과 시험이 이 글자를 붙든다.
          <span
            role="status"
            className="mono shrink-0 rounded bg-unread-strong px-1.5 py-0.5 text-sm font-medium text-unread-fg"
          >
            안 읽음
          </span>
        )}

        {/* T04 — 미착지 표식(캡틴 결정 Q4). 어느 사본에서 왔는지는 말하지 않는다. */}
        {ticket.unlanded && <UnlandedBadge />}
        {conflict && <ConflictBadge conflicts={[conflict]} />}

        {ticket.docConvention === "tickets" ? (
          // T04 — 신관례는 파일에 상태가 없다(SoT = Time: 줄). 조인 실패(joinFailed)면
          // "상태 미표시" 가 정답이다(추측 금지, T04 §구현 원칙).
          !ticket.joinFailed && ticket.status !== "pending" && (
            <span className="mono shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-sm text-muted">
              {ticket.status === "done" ? "완료" : ticket.status === "in_progress" ? "처리중" : "대기"}
            </span>
          )
        ) : ticket.statusKnown ? (
          <span className="mono shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-sm text-muted">
            {ticket.sourceStatus}
          </span>
        ) : (
          // 알 수 없는 상태 = 조용히 버리는 대신 눈에 띄게. 원문을 그대로 보여준다(INV-4 릴레이).
          <span
            role="status"
            className="mono flex shrink-0 items-center gap-1 rounded bg-drop/15 px-1.5 py-0.5 text-sm text-drop"
            title="정규 아홉 값이 아닙니다"
          >
            <IconAlertTriangle size={13} />
            {ticket.sourceStatus === null
              ? "상태 줄 없음"
              : `알 수 없는 상태: ${ticket.sourceStatus}`}
          </span>
        )}

        {/* 🔴 단계/완료를 한 칸에 합침(사용자 결정 #2) — 한 행에서 둘은 배타적이라
            하나의 고정폭(16ch) 칸으로 충분하다. done 은 완료 시점부터의 경과를 적되
            7일을 넘기면 절댓값 날짜(YYYY-MM-DD)로 바꾼다. 값이 없어도 칸은 자리를 지킨다(alignment). */}
        <span className="mono inline-block w-[16ch] shrink-0 text-sm">
          {ticket.completedAt ? (
            <span className="tabular-nums text-muted">{formatCompleted(ticket.completedAt)}</span>
          ) : (
            <StageCell stage={stage} />
          )}
        </span>

        {stage === "in_progress" && (
          // 어느 가지가 붙들고 있는지 verbatim 으로 싣는다 — 감추지 않는다.
          <span
            className="mono max-w-full truncate text-sm text-active"
            title={`작업 가지: ${ticket.workedBy.join(", ")}`}
          >
            {ticket.workedBy.join(", ")}
          </span>
        )}
        </button>
        {tip}
      </li>
  );
}