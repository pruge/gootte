import type { StepDropTarget } from "@gootte/contract";
import type { ProcessRow, ProcessStepGroup } from "@gootte/core/plan";

/**
 * `process` 탭 끌어 놓기(plan-board/08)의 DOM id ↔ 계약 값 변환 — `plan` 탭의 `areas.ts` 와
 * 같은 자리. dnd-kit 은 문자열 id 만 다루므로, 그 id 를 `StepDropTarget`(계약)이나
 * `{feature, ticket}` 으로 되돌리는 순수 함수를 한 곳에 모아 화면(`ProcessView.tsx`)에서
 * 떼어 낸다 — 판정(놓은 자리 → 저장 숫자)은 여전히 서버의 `placeStep`(core) 하나뿐이다.
 */

/** 끌기 id ↔ `feature`·`ticket` — 슬러그에 `/` 가 없다는 전제(다른 화면의 관례와 같다). */
export const dragId = (feature: string, ticket: string): string => `${feature}/${ticket}`;

export function parseDragId(id: string): { feature: string; ticket: string } | null {
  const at = id.indexOf("/");
  if (at < 0) return null;
  return { feature: id.slice(0, at), ticket: id.slice(at + 1) };
}

/** 놓을 자리 id — 세 가지뿐이다(spec §놓을 수 있는 자리). */
export const ON_STEP_ID = (displayStep: number): string => `onStep:${displayStep}`;
export const GAP_ID = (index: number): string => `gap:${index}`;
export const UNRANKED_ID = "unranked";

export function parseDropTarget(id: string): StepDropTarget | null {
  if (id === UNRANKED_ID) return { kind: "unranked" };
  if (id.startsWith("onStep:")) {
    const n = Number(id.slice(7));
    return Number.isFinite(n) ? { kind: "onStep", displayStep: n } : null;
  }
  if (id.startsWith("gap:")) {
    const n = Number(id.slice(4));
    return Number.isFinite(n) ? { kind: "gap", index: n } : null;
  }
  return null;
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
