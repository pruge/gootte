import type { PlanCard } from "@gootte/contract";
import { ticketBoxState, type TicketBoxState } from "./close";
import { UNRANKED_STEP } from "./move";

/** `process` 탭 한 줄 — 어느 기능의 몇 번 티켓인지와 제목, 상자(plan-board/07, 셋으로 넓힘은 12). */
export interface ProcessRow {
  feature: string;
  ticket: string;
  num: string;
  title: string;
  // 기능 폴더 기준 상대 경로("issues/01-x.md" 또는 "tickets/T01.md") — 문서 읽기 API 의 `path`
  // 로 그대로 쓴다(feature-doc-browser/04). 화면이 관례별로 다시 조립하지 않는다(INV-4).
  path: string;
  // 상자 셋 중 하나 — `[x]`/`[-]`/`[ ]` 는 화면이 여기서 그린다. 못 끄는 줄도 여기서
  // 파생한다("open" 이 아니면 끝난 것 — plan-board/12).
  box: TicketBoxState;
  // 안 읽음 표시(unread-tickets-show-themselves/02) — `ticket.unread` 를 그대로 옮긴다.
  // 판정 자리는 여전히 `applyReadState`(core) 하나뿐이다.
  unread: boolean;
  // 처리중 표시(status-colors-tell-apart/02) — `ticket.status === "in_progress"` 를 그대로
  // 옮긴다. 판정 자리는 격리 사본 관측(`applyInProgress`, core) 하나뿐 — 여기서 다시 정하지 않는다.
  inProgress: boolean;
}

/** `process` 탭 단계 묶음 하나 — 제목과 그 밑 줄들. */
export interface ProcessStepGroup {
  step: number;
  rows: readonly ProcessRow[];
}

/**
 * 작업 대상 카드(`PlanBoardResponse.active`)를 단계별로 묶는다(plan-board/07).
 *
 * 🔴 **판정하지 않는다** — 카드마다 이미 실려 온 `steps`(당김까지 끝난 표시 단계,
 * `computeDisplaySteps`, plan-board/05)를 그대로 모을 뿐이다. 판정 자리는 그 함수 하나뿐이고,
 * 여기서 다시 계산하면 판정 자리가 둘이 된다.
 *
 * 🔴 **기능으로 묶지 않는다** — 묶음은 단계가 하고, 어느 기능인지는 줄이 말한다.
 * 🔴 `9999`(`UNRANKED_STEP`)는 당기지 않고 번호가 매겨진 단계들 뒤, 맨 끝에 그대로 선다.
 * 값이 없는 티켓(작업 대상 밖이거나 빈 단계로 당겨져 사라진 티켓)은 어느 묶음에도 나오지 않는다.
 */
export function groupProcessSteps(cards: readonly PlanCard[]): ProcessStepGroup[] {
  const byStep = new Map<number, ProcessRow[]>();
  for (const card of cards) {
    const steps = card.steps ?? {};
    for (const ticket of card.feature.tickets) {
      const step = steps[ticket.slug];
      if (step === undefined) continue;
      const row: ProcessRow = {
        feature: card.feature.slug,
        ticket: ticket.slug,
        num: ticket.num,
        title: ticket.title,
        path: ticket.path,
        box: ticketBoxState(ticket),
        unread: ticket.unread === true,
        inProgress: ticket.status === "in_progress",
      };
      const list = byStep.get(step);
      if (list) list.push(row);
      else byStep.set(step, [row]);
    }
  }

  const bySlug = (a: ProcessRow, b: ProcessRow): number =>
    a.feature.localeCompare(b.feature) || a.ticket.localeCompare(b.ticket);

  const numbered = [...byStep.keys()].filter((n) => n !== UNRANKED_STEP).sort((a, b) => a - b);
  const groups: ProcessStepGroup[] = numbered.map((step) => ({
    step,
    rows: [...(byStep.get(step) ?? [])].sort(bySlug),
  }));

  const unranked = byStep.get(UNRANKED_STEP);
  if (unranked) groups.push({ step: UNRANKED_STEP, rows: [...unranked].sort(bySlug) });

  return groups;
}
