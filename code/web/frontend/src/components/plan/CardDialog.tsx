import { useEffect, useRef } from "react";
import { IconAlertTriangle, IconX } from "@tabler/icons-react";
import type { FeatureConflict, FeatureTicket, PlanCard } from "@gootte/contract";
import { allTickets } from "@gootte/core";
import { closedDisplayAt, ticketBoxState, UNRANKED_STEP } from "@gootte/core/plan";
import { ConflictBadge } from "../features/ConflictBadge";
import { useHoverTip } from "../HoverTip";
import { featureDescription } from "./cardTitle";

/** 계산된 상태(ticket.status)를 통합 라벨로 매핑 — TicketRow 와 공통. */
function statusBadgeLabel(status: FeatureTicket["status"]): string {
  switch (status) {
    case "pending":
    case "in_sprint":
      return "대기";
    case "in_progress":
      return "처리중";
    case "done":
      return "완료";
    case "dropped":
      return "폐기";
    default:
      const _exhaustive: never = status;
      return _exhaustive;
  }
}

/**
 * 표시 단계 순으로 줄 세운다(plan-board/05) — 값이 없는 티켓(작업 대상 밖 카드, 빈 단계로
 * 당겨져 사라진 티켓)은 문서 순서 그대로 뒤에 남는다. 판정은 `card.steps`(서버가 이미
 * `computeDisplaySteps` 로 계산해 실은 값) 하나뿐이다 — 여기서 다시 매기지 않는다.
 */
function orderByStep(tickets: readonly FeatureTicket[], steps: Record<string, number>): FeatureTicket[] {
  return [...tickets].sort((a, b) => (steps[a.slug] ?? Infinity) - (steps[b.slug] ?? Infinity));
}

interface CardDialogProps {
  card: PlanCard;
  /** 이 카드가 완료 칸에 있는가 — 닫힌 시각을 보여줄지 판단하는 데만 쓴다(06, `BoardCard`와 같은 이유). */
  closed?: boolean;
  onClose: () => void;
  /** 티켓 줄을 누른 것 — 그 티켓 원문을 연다(캡틴 결정 2026-08-12: "ticket 클릭하면 문서 보이게해"). */
  onOpenTicket: (path: string) => void;
}

/**
 * 카드 한 장을 **펼쳐 보는 대화상자**(캡틴 결정 2026-08-12: "카드 헤더를 클릭하면 dialog 로 떠서
 * 카드를 펼쳐서 보여준다. 확인을 누르면 닫히게 하자").
 *
 * 🔴 판에서 **제자리 펼침을 대신한다.** 아래 칸은 카드 2.5줄 높이로 못 박혀 있어(02) 티켓이 다섯
 * 장만 돼도 펼친 줄이 칸 밖으로 밀려 한 번에 보이지 않았다 — 판의 크기를 건드리지 않고 목록을
 * 통째로 보여 주는 자리가 여기다.
 *
 * 🔴 **상태를 고치는 창이 아니다.** 상자를 눌러 값을 바꾸는 길은 없다 — 티켓 상태의 SoT 는 문서이고
 * (INV-2·INV-5), 여기서 고칠 수 있게 하면 그 순간 두 번째 SoT 가 생긴다. 줄을 누르면 그 티켓의
 * **원문이 열린다**(캡틴 결정) — 고치는 게 아니라 문서로 가는 또 하나의 길이다. 새 문서 뷰어를
 * 짓지 않고 이미 있는 `DocDrawer`(`features` 탭)를 그대로 재사용한다 — 여는 자리만 `PlanView`가
 * 하나 더 갖는다.
 */
function CardTicketRow({
  t,
  step,
  conflict,
  onOpenTicket,
}: {
  t: FeatureTicket;
  step: number | undefined;
  conflict: FeatureConflict | undefined;
  onOpenTicket: (path: string) => void;
}) {
  const box = ticketBoxState(t);
  const closedTicket = box !== "open";
  const glyph = box === "done" ? "[x]" : box === "dropped" ? "[-]" : "[ ]";
  const unread = t.unread === true;
  const inProgress = t.status === "in_progress";
  // T02(a-ticket-tells-how-long-it-took) — 툴팁엔 **걸린 시간만** 뜬다(상태 문구는 뺐다, 캡틴 지시).
  // 시간이 없으면 툴팁 자체를 띄우지 않는다(INV-4 — 값이 없으면 아무것도 안 보여준다).
  const tipLabel = t.elapsed ?? null;
  // 🔴 네이티브 `title` 은 글리프만 26×20px 라서 안 보였다 — 행 전체 hover 로 즉시 뜨는
  // 보이는 툴팁(HoverTip)으로 바꾼다(네이티브 title 은 제거, T02 후속 지시).
  const { triggerProps, tip } = useHoverTip(tipLabel);
  return (
    <li>
      {/* 🔴 줄 전체가 단추다 — 원문을 여는 것 하나뿐이라 부분 클릭을 나눌 이유가 없다.
          상자는 여전히 문서에서 읽을 뿐 여기서 바뀌지 않는다(INV-5). */}
      <button
        type="button"
        {...triggerProps}
        onClick={() => onOpenTicket(t.path)}
        className={`flex w-full flex-wrap items-baseline gap-x-2.5 gap-y-1 px-5 py-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
          unread
            ? "bg-unread hover:bg-unread-strong"
            : inProgress
              ? "bg-inprogress hover:bg-inprogress-strong"
              : "hover:bg-surface-2"
        } ${closedTicket ? "text-muted" : ""}`}
      >
        <span className={`mono shrink-0 text-sm ${closedTicket ? "text-accent" : "text-muted"}`}>{glyph}</span>
        {/* firstmate 가 매긴 단계(05) — 작업 대상 밖 카드나 값이 없는 티켓은 칸이 비어도
            자리는 지킨다(같은 폭 유지, 값 있는 줄과 나란히 서게). */}
        <span
          className={`mono shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-sm text-muted ${
            step === undefined ? "invisible" : ""
          }`}
        >
          {step === UNRANKED_STEP ? "—단계" : `${step ?? 0}단계`}
        </span>
        <span className="mono shrink-0 text-sm tabular-nums text-muted">{t.num || "—"}</span>
        <span className="min-w-0 flex-1 break-words text-sm">{t.title}</span>
        {unread && (
          // 색 말고도 붙들 것이 있다(INV-U2) — `features` 탭 `TicketRow` 와 같은 표시.
          <span
            role="status"
            className="mono shrink-0 rounded bg-unread-strong px-1.5 py-0.5 text-sm font-medium text-unread-fg"
          >
            안 읽음
          </span>
        )}
        {conflict && <ConflictBadge conflicts={[conflict]} />}
        {inProgress && (
          // 색 말고도 붙들 것이 있다(INV-C2) — 처리중은 배경과 이 글자로만 말한다,
          // 테두리는 얹지 않는다(캡틴 지시 2026-08-13: "처리중 보더를 제거해봐").
          <span role="status" className="mono shrink-0 text-sm font-medium text-active">
            처리중
          </span>
        )}
        {/* 신/구관례 공통: 계산된 상태(t.status)를 통합 라벨로 배지 표시.
            - 구관례도 sourceStatus(원문) 대신 계산된 상태를 보여줘 열이 통일된다.
            - statusKnown:false(읽기 실패)만 경고로 폴백.
            - 🔴 처리중(in_progress)일 때는 위 inProgress 영역이 "처리중"을 말하므로
              상태 배지에서 "처리중"은 숨겨 중복을 막는다. */}
        {t.statusKnown && t.status !== "in_progress" ? (
          <span className="mono shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-sm text-muted">
            {statusBadgeLabel(t.status)}
          </span>
        ) : t.statusKnown ? null : (
          <span
            role="status"
            className="mono flex shrink-0 items-center gap-1 rounded bg-drop/15 px-1.5 py-0.5 text-sm text-drop"
            title="정규 아홉 값이 아닙니다"
          >
            <IconAlertTriangle size={13} />
            {t.sourceStatus === null ? "상태 줄 없음" : `알 수 없는 상태: ${t.sourceStatus}`}
          </span>
        )}
      </button>
      {tip}
    </li>
  );
}

export function CardDialog({ card, closed = false, onClose, onOpenTicket }: CardDialogProps) {
  const okRef = useRef<HTMLButtonElement>(null);
  const { feature } = card;
  const description = featureDescription(feature.title, feature.slug);
  // 닫힌 시각 하나 — 카드 머리와 같은 판정을 쓴다(`closedDisplayAt`, 06).
  const closedDisplay = closed ? closedDisplayAt(card.closedAt, feature) : null;
  // 작업 대상 카드에만 값이 있다(05) — 나머지 칸의 카드는 빈 표라 순서·표시가 그대로다.
  const steps = card.steps ?? {};
  // 🔴 issues/(구관례)와 tickets/(신관례, T04) 를 합친다 — 안 그러면 tickets/ 만 쓰는 기능은
  // 이 대화상자가 "티켓 0 · 티켓이 없습니다" 를 보여준다(캡틴 보고, 2026-08-25).
  const tickets = allTickets(feature);
  const orderedTickets = orderByStep(tickets, steps);
  // T03 — 갈라진 파일 경로 → 그 사실. 대화상자도 같은 화법을 쓴다(화면·CLI 가 같은 사실을 말한다).
  const conflictByPath = new Map<string, FeatureConflict>((feature.conflict ?? []).map((c) => [c.path, c]));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => okRef.current?.focus(), []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="대화상자 닫기"
        className="absolute inset-0 bg-fg/25 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-dialog-heading"
        className="relative flex max-h-[80vh] w-[min(720px,92vw)] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="min-w-0">
            <h2 id="card-dialog-heading" className="min-w-0">
              <span className="mono block truncate text-sm text-muted">{feature.slug}</span>
              {description && (
                <span className="mt-0.5 block font-medium tracking-tight break-words">
                  {description}
                </span>
              )}
            </h2>
            {/* 카드 머리가 이고 있던 곁다리를 그대로 옮겨 온다 — 창을 열었다고 사실이 사라지지 않게. */}
            <p className="mono mt-1.5 flex flex-wrap items-baseline gap-x-2.5 text-sm tabular-nums text-muted">
              <span>티켓 {tickets.length}</span>
              {closedDisplay && <span>닫힘 {closedDisplay}</span>}
              {/* T03 — 이 기능이 갈라졌으면 대화상자도 조용히 넘기지 않는다(ADR-0001). */}
              <ConflictBadge conflicts={feature.conflict ?? []} />
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="shrink-0 rounded p-1.5 text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            <IconX size={18} />
          </button>
        </header>

        {/* 티켓이 많은 기능도 한 창에서 끝까지 읽힌다 — 목록만 스크롤하고 머리와 확인 단추는 선다. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tickets.length === 0 ? (
            // 티켓이 없는 기능도 감추지 않는다 — 열었는데 빈 창이면 화면이 이유를 말해야 한다.
            <p className="px-5 py-4 text-sm text-muted">티켓이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-border/50">
              {orderedTickets.map((t) => (
                <CardTicketRow
                  key={t.slug}
                  t={t}
                  step={steps[t.slug]}
                  conflict={conflictByPath.get(t.path)}
                  onOpenTicket={onOpenTicket}
                />
              ))}
            </ul>
          )}
        </div>

        <footer className="flex shrink-0 justify-end border-t border-border px-5 py-3">
          <button
            ref={okRef}
            type="button"
            onClick={onClose}
            className="rounded-md bg-accent px-4 py-1.5 font-medium tracking-tight text-accent-fg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-accent"
          >
            확인
          </button>
        </footer>
      </div>
    </div>
  );
}