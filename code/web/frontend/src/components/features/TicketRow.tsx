import {
  IconAlertTriangle,
  IconCircleCheckFilled,
  IconCircleDashed,
  IconCircleX,
  IconLock,
  IconProgress,
} from "@tabler/icons-react";
import type { FeatureTicket } from "@gootte/contract";
import { BACKLOG_STATUS_LABEL } from "../../lib/backlogStatusLabel";
import { TICKET_LIST_DEPTH, treeIndentStyle } from "../../lib/tree-indent";
import { triggerKey } from "./docTrigger";
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
}: {
  ticket: FeatureTicket;
  featureSlug: string;
  onOpenDoc: OpenDocFn;
  /** 검색어 — 이 티켓이 검색으로 걸렸다면 걸린 자리를 노란 칩으로 보여준다. */
  query?: string;
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

        {ticket.docConvention === "tickets" ? (
          // T04 — 신관례는 파일에 상태가 없다(SoT = 백로그). 조인됐을 때만 배지를 낸다 —
          // 조인 실패(미매칭)는 "상태 미표시" 가 정답이다(추측 금지, T04 §구현 원칙).
          ticket.backlogStatus && (
            <span className="mono shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-sm text-muted">
              {BACKLOG_STATUS_LABEL[ticket.backlogStatus] ?? ticket.backlogStatus}
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

        <StageCell stage={stage} />

        {/* 완료일 칸은 값이 없어도 늘 그린다 — 값이 있을 때와 같은 자리표시 문자열을 같은 글꼴로
            렌더링해 폭을 맞추고, invisible 로 보이지만 않게 한다.
            `—` 같은 대체 문자는 넣지 않는다 — 이 목록에서 `—` 는 이미 번호 없는 티켓을 뜻한다.
            🔴 시각까지 있는 완료일(`YYYY-MM-DD HH:MM`)과 날짜만 있는 완료일(`YYYY-MM-DD`)이 섞여도
            칸이 어긋나지 않게, 폭을 **가장 긴 서식**(`w-[16ch]`)으로 고정한다(06) — 글자 수가
            줄마다 달라도 이 칸의 왼쪽 시작점은 늘 같은 자리다. */}
        <span
          className={`mono inline-block w-[16ch] shrink-0 text-sm tabular-nums text-muted ${
            ticket.completedAt ? "" : "invisible"
          }`}
        >
          {ticket.completedAt ?? "0000-00-00 00:00"}
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

        {stage === "waiting" && (
          // 번호로 해소되지 않은 선행(다른 기능을 가리키는 문구 등)도 그대로 보인다 — verbatim 릴레이(INV-4).
          <span
            className="mono max-w-full truncate text-sm text-muted"
            title={ticket.waitingOn.join(", ")}
          >
            → {ticket.waitingOn.join(", ")}
          </span>
        )}
      </button>
    </li>
  );
}
