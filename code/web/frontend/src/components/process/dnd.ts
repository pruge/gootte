import type { StepDropTarget } from "@gootte/contract";
import type { ProcessRow, ProcessStepGroup } from "@gootte/core/plan";

/**
 * `process` 탭 끌어 놓기(plan-board/08)의 DOM id ↔ 계약 값 변환 — `plan` 탭의 `areas.ts` 와
 * 같은 자리. dnd-kit 은 문자열 id 만 다루므로, 그 id 를 `StepDropTarget`(계약)이나
 * `{feature, ticket}` 으로 되돌리는 순수 함수를 한 곳에 모아 화면(`ProcessView.tsx`)에서
 * 떼어 낸다 — 판정(놓은 자리 → 저장 숫자)은 여전히 서버의 `placeStep`(core) 하나뿐이다.
 *
 * 🔴 **놓을 수 있는 자리마다 따로 dnd-kit droppable 을 두지 않는다.** 처음엔 "사이" 를 카드
 * 가장자리의 얇은 띠(별도 droppable)로 뒀는데, 그 좁은 표적을 손이 거의 못 맞혀 "사이" 가
 * 이웃 단계 위(onStep)로 새는 문제가 있었다(캡틴 지적 2026-08-12: "1단계 2단계 사이에
 * 갖다 놓고 싶을때는 어떻게? 지금은 마지막 단계만 새롭게 추가되는데"). 대신 **카드 하나를
 * 통째로 droppable 로 두고**, 그 안에서 놓은 자리(위/아래 가장자리 vs 나머지)를 좌표로 가른다
 * — 표적이 카드 전체라 손이 빗나갈 일이 없다.
 */

/** 끌기 id ↔ `feature`·`ticket` — 슬러그에 `/` 가 없다는 전제(다른 화면의 관례와 같다). */
export const dragId = (feature: string, ticket: string): string => `${feature}/${ticket}`;

export function parseDragId(id: string): { feature: string; ticket: string } | null {
  const at = id.indexOf("/");
  if (at < 0) return null;
  return { feature: id.slice(0, at), ticket: id.slice(at + 1) };
}

/** 카드 droppable id — 번호 매겨진 단계 카드 하나, 또는 `9999` 카드. */
export const ON_STEP_ID = (displayStep: number): string => `onStep:${displayStep}`;
export const UNRANKED_ID = "unranked";

/** 카드 위쪽/아래쪽 가장자리로 볼 두께(px) — 이 안에 놓으면 "사이"·"앞"·"뒤" 로 본다. */
export const EDGE_PX = 28;

export interface ResolvedStepDrop {
  target: StepDropTarget;
  /** 강조를 그릴 카드와 자리 — 화면 서식용(판정에는 안 쓴다). */
  card: { step: number; edge: "before" | "after" | "whole" };
}

/**
 * 카드 droppable id + (카드 사각형, 놓은 세로 좌표) → 계약의 `StepDropTarget`.
 *
 * `overRect`·`pointerY` 가 없으면(키보드 끌기 등, 좌표를 모를 때) 카드 전체를 그 단계로
 * 본다 — 가장자리를 못 재면 "사이" 를 시도하지 않는 편이 안전하다.
 *
 * 🔴 번호 매겨진 단계가 하나도 없을 때는 `9999` 카드의 위쪽 가장자리가 "새 단계를 만든다" 를
 * 대신한다 — 그 자리 말고는 번호를 매길 카드가 아예 없기 때문이다(spec §놓을 수 있는 자리).
 */
export function resolveStepDrop(
  overId: string,
  overRect: { top: number; height: number } | null,
  pointerY: number | null,
  numberedCount: number,
): ResolvedStepDrop | null {
  const edge = overRect && pointerY !== null ? pointerY - overRect.top : null;

  if (overId === UNRANKED_ID) {
    if (numberedCount === 0 && edge !== null && edge < EDGE_PX) {
      return { target: { kind: "gap", index: 0 }, card: { step: 0, edge: "before" } };
    }
    return { target: { kind: "unranked" }, card: { step: 0, edge: "whole" } };
  }

  if (!overId.startsWith("onStep:")) return null;
  const step = Number(overId.slice(7));
  if (!Number.isFinite(step) || step < 1) return null;

  // 🔴 위·아래 가장자리는 **모든 번호 매겨진 카드가 똑같이** 갖는다(캡틴 지적 2026-08-12:
  // "각 단계마다 위아래로 새로운단계를 만드는 곳을 놓아줘. 있다가 없다가 일정하지 않으니
  // 헷갈려") — 카드 i 의 아래 가장자리와 카드 i+1 의 위 가장자리는 같은 틈(gap i)을 가리키는
  // 두 표적일 뿐이다.
  if (edge !== null && overRect) {
    if (edge < EDGE_PX) {
      return { target: { kind: "gap", index: step - 1 }, card: { step, edge: "before" } };
    }
    if (overRect.height - edge < EDGE_PX) {
      return { target: { kind: "gap", index: step }, card: { step, edge: "after" } };
    }
  }
  return { target: { kind: "onStep", displayStep: step }, card: { step, edge: "whole" } };
}

/** 끈 줄이 어느 티켓인지 — 화면이 이미 그리고 있는 묶음에서 찾는다(새 조회를 만들지 않는다). */
export function findRow(groups: readonly ProcessStepGroup[], id: string): ProcessRow | null {
  const parsed = parseDragId(id);
  if (!parsed) return null;
  for (const g of groups) {
    const row = g.rows.find((r) => r.feature === parsed.feature && r.ticket === parsed.ticket);
    if (row) return row;
  }
  return null;
}
