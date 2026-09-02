import { useState } from "react";
import {
  IconArrowMoveRight,
  IconFileText,
  IconFlag,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerTrackNext,
} from "@tabler/icons-react";
import { allTickets } from "@gootte/core";
import type { Feature, FeatureTicket } from "@gootte/contract";
import { useHoverTip } from "../HoverTip";
import { usePlanBoard, usePlanMove, useRecordTime } from "../../lib/query";
import { featureDescription } from "../plan/cardTitle";
import { DocDrawer } from "../features/DocDrawer";
import { Loading, ErrorMsg } from "../common/states";
import { MoveDialog } from "../plan/MoveDialog";
import { featureDocPath } from "../plan/planDoc";
import { changesBoard, storedArea, type BoardAreaId } from "../plan/areas";

interface ProcessViewProps {
  project: string;
}

/** 남은(open) 티켓 수 — 완료·폐기 제외. 두 관례(구 issues/ · 신 tickets/)를 합쳐 센다(INV-1). */
function openCount(f: Feature): number {
  return allTickets(f).filter((t) => t.status !== "done" && t.status !== "dropped").length;
}

/**
 * `process`(steps) 탭 — 작업 대상 feature 를 **2컬럼(1:2)** 으로 읽는다(process-two-column/T01).
 *
 * - **왼쪽(1/3)**: 작업 대상(`PlanBoardResponse.active`)의 feature 목록. 클릭하면 선택.
 * - **오른쪽(2/3)**: 선택한 feature 의 **모든 티켓** — 구관례(`issues/`)와 신관례(`tickets/`)를
 *   합쳐 번호·제목·상자·안 읽음·처리중·단계로 줄 세운다. **완료([x])·폐기([-]) 티켓도 숨기지 않는다**
 *   (캡틴 지시: "여기서는 완료된것을 숨길필요가 없다").
 *
 * 🔴 화면은 서버가 이미 계산해 보낸 값만 그린다(INV-1) — 티켓 상태·상자·단계는 core 판정을 그대로
 *   옮겨 실을 뿐 여기서 다시 재지 않는다. 선택 상태는 화면 로컬이다(파생물, 저장하지 않는다).
 */
export function ProcessView({ project }: ProcessViewProps) {
  const { data, isError, error } = usePlanBoard(project);
  const { record: recordTime } = useRecordTime(project);
  const move = usePlanMove(project);
  const [selected, setSelected] = useState<string | null>(null);
  const [ticketDoc, setTicketDoc] = useState<{ feature: string; path: string } | null>(null);
  const [moveDialog, setMoveDialog] = useState<string | null>(null);

  if (isError && !data) return <ErrorMsg error={error} />;
  if (!data) return <Loading label="순서를 읽는 중…" />;

  const features = data.active.map((c) => c.feature);
  const current = features.find((f) => f.slug === selected) ?? features[0] ?? null;

  // 🔴 판의 다섯 칸 — 카드가 어느 칸에 담겨 있는가가 곧 그 카드의 자리다(contract, `PlanCard` 는
  // `area` 를 싣지 않는다). 이동 아이콘의 "지금 있는 칸"(`MoveDialog` 의 `from`)을 알기 위해서만
  // 쓴다 — 자리를 판정하는 자리는 여전히 서버 하나다.
  const areaOfCard = (slug: string): BoardAreaId | undefined => {
    const keys: BoardAreaId[] = ["waiting", "active", "reserved", "discarded", "done"];
    return keys.find((k) => data[k].some((c) => c.feature.slug === slug));
  };

  /** spec.md 읽기 — plan 탭 카드 머리의 문서 아이콘과 같은 경로(`featureDocPath`)를 연다. */
  const openSpecDoc = (slug: string) => {
    const feature = features.find((f) => f.slug === slug);
    if (!feature) return;
    const path = featureDocPath(feature);
    if (path) setTicketDoc({ feature: slug, path });
  };

  return (
    <div className="flex h-full min-h-0">
      {/* 왼쪽 컬럼(1) — feature 목록 */}
      <aside className="w-1/3 shrink-0 overflow-y-auto border-r border-border pr-2">
        <h2 className="mono px-2 pt-1 pb-2 text-sm font-semibold tracking-[0.15em] text-muted">
          FEATURES
        </h2>
        {features.length === 0 ? (
          <p className="px-2 text-sm text-muted">작업 대상에 올라온 것이 없다</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {features.map((f) => (
              <li key={f.slug}>
                <button
                  type="button"
                  onClick={() => setSelected(f.slug)}
                  aria-current={current?.slug === f.slug ? "true" : undefined}
                  className={`flex w-full items-baseline gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
                    current?.slug === f.slug
                      ? "bg-accent/12 font-semibold text-fg"
                      : "text-muted hover:bg-surface-2 hover:text-fg"
                  } focus-visible:outline-2 focus-visible:outline-accent`}
                >
                  <span className="min-w-0 flex-1 truncate">{f.slug}</span>
                  {/* 🔴 처리중 티켓이 있으면 파란 원점 — 배경색 말고도 붙들 것이 있다(INV-C2).
                      `allTickets` 로 두 관례(구 issues/ · 신 tickets/)를 합쳐, status 가 in_progress 인
                      티켓이 하나라도 있으면 점을 찍는다. 판정 자리는 서버(`applyInProgress`) 하나다.
                      숫자(남은 티켓 수) 앞에 둔다 — 캡틴 지시(2026-09-02). */}
                  {allTickets(f).some((t) => t.status === "in_progress") && (
                    <span
                      role="status"
                      aria-label={`${f.slug} 처리중 티켓 있음`}
                      title="처리중 티켓 있음"
                      className="h-2 w-2 shrink-0 rounded-full bg-active"
                    />
                  )}
                  {/* 🔴 남은(open) 티켓 수 — 완료·폐기 제외. `allTickets` 로 두 관례를 합쳐 센다(INV-1,
                      서버가 준 값만 셀 뿐 다시 판정하지 않는다). 0 이어도 칸이 사라지지 않는다. */}
                  <span
                    title="남은 티켓 수"
                    className={`mono shrink-0 rounded-full px-1.5 text-xs font-medium tabular-nums ${
                      openCount(f) > 0 ? "bg-accent/15 text-accent" : "bg-surface-2 text-muted"
                    }`}
                  >
                    {openCount(f)}
                  </span>
                  {f.hasUnreadTicket === true && (
                    <span className="mono shrink-0 rounded bg-unread-strong px-1.5 py-0.5 text-sm font-medium text-unread-fg">
                      안 읽음
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {/* 오른쪽 컬럼(2) — 선택된 feature 의 모든 티켓 (완료 포함) */}
      <div className="min-w-0 flex-1 overflow-y-auto pl-4">
        {!current ? (
          <p className="text-sm text-muted">작업 대상에 올라온 것이 없다</p>
        ) : (
          <div>
            <FeatureHeading
              feature={current}
              onOpenDoc={openSpecDoc}
              onRequestMove={setMoveDialog}
            />
            <ul className="mt-2 divide-y divide-border/30">
              {allTickets(current).map((t) => (
                <TicketLine
                  key={`${current.slug}/${t.slug}`}
                  feature={current}
                  ticket={t}
                  onOpen={() =>
                    setTicketDoc({ feature: current.slug, path: t.path })
                  }
                  onTimeAction={(action) =>
                    recordTime({ feature: current.slug, ticket: t.num, action })
                  }
                />
              ))}
            </ul>
          </div>
        )}
      </div>

      <DocDrawer
        project={project}
        featureSlug={ticketDoc?.feature ?? null}
        path={ticketDoc?.path ?? null}
        onClose={() => setTicketDoc(null)}
      />

      {moveDialog && current && (
        <MoveDialog
          features={[moveDialog]}
          from={areaOfCard(moveDialog) ?? "active"}
          onClose={() => setMoveDialog(null)}
          onMove={(to) => {
            setMoveDialog(null);
            const from = areaOfCard(moveDialog) ?? "active";
            if (!changesBoard(from, to, data[to].map((c) => c.feature.slug), [moveDialog], data[to].length)) return;
            move.move({ features: [moveDialog], area: storedArea(to), index: data[to].length });
          }}
        />
      )}
    </div>
  );
}

/** 오른쪽 컬럼 머리 — 기능 이름 + 설명문구 두 줄(plan 탭 카드 머리와 같은 자리).
 * plan 탭 카드 머리의 곁다리 세 가지(티켓 수 · spec.md 읽기 · 이동)를 그대로 실는다(캡틴 지시):
 * 캡틴이 steps 탭에 머문 채로 "이 기능이 무슨 문서인지" 와 "이 기능을 어디로 보낼지"를 정할 수 있다. */
function FeatureHeading({
  feature,
  onOpenDoc,
  onRequestMove,
}: {
  feature: Feature;
  onOpenDoc: (slug: string) => void;
  onRequestMove: (slug: string) => void;
}) {
  const description = featureDescription(feature.title, feature.slug);
  // 🔴 issues/(구관례)와 tickets/(신관례, T04) 를 합친다 — 안 그러면 tickets/ 만 쓰는 기능은
  // "티켓 0" 을 보여준다(`FeatureCard` 와 같은 결함, 2026-08-25).
  const ticketCount = allTickets(feature).length;
  return (
    <div className="flex flex-col gap-y-0.5 border-b border-border px-2 pb-2">
      <div className="flex flex-wrap items-center gap-x-2">
        <span
          className={`mono min-w-0 text-sm ${
            description ? "text-muted" : "font-medium tracking-tight"
          }`}
        >
          {feature.slug}
        </span>
        {feature.hasUnreadTicket === true && (
          <span
            role="status"
            className="mono shrink-0 rounded bg-unread-strong px-1.5 py-0.5 text-sm font-medium text-unread-fg"
          >
            안 읽음
          </span>
        )}
        <span className="mono shrink-0 text-sm tabular-nums text-muted">티켓 {ticketCount}</span>
        <span className="ml-auto flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => onOpenDoc(feature.slug)}
            aria-label={`${feature.slug} 문서 열기`}
            title="이 기능의 spec.md 를 연다"
            className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            <IconFileText size={17} stroke={1.6} />
          </button>
          <button
            type="button"
            onClick={() => onRequestMove(feature.slug)}
            aria-label={`${feature.slug} 다른 칸으로 보내기`}
            title="어느 칸으로 보낼지 고른다"
            className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            <IconArrowMoveRight size={17} stroke={1.6} />
          </button>
        </span>
      </div>
      {description && (
        <span className="break-words text-sm font-medium tracking-tight">{description}</span>
      )}
    </div>
  );
}

/** 상자 글리프 — `[x]`/`[-]`/`[ ]` 는 문서 상태에서 이미 계산된 `ticket.status` 로 그린다. */
function boxGlyph(t: FeatureTicket): string {
  if (t.status === "done") return "[x]";
  if (t.status === "dropped") return "[-]";
  return "[ ]";
}

function rowTone(t: FeatureTicket): string {
  return t.unread === true
    ? "bg-unread hover:bg-unread-strong"
    : t.status === "in_progress"
      ? "bg-inprogress hover:bg-inprogress-strong"
      : "hover:bg-surface-2";
}

function TicketLine({
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
              처리중
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
