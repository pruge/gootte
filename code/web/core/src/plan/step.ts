import type { Feature, Placement } from "@gootte/contract";
import { ticketChecked } from "./close";
import { UNRANKED_STEP, type StepRow } from "./move";

/**
 * feature slug → ticket slug → 화면에 보일 단계(당김까지 끝난 값, plan-board/05).
 * 값이 없는 조합은 이 표에 없다 — 빈 단계로 당겨져 사라졌거나 작업 대상 밖이다.
 */
export type DisplayStepMap = Record<string, Record<string, number>>;

/**
 * 저장된 단계 숫자 → 화면에 보일 단계. **판정 자리는 여기 하나뿐이다**(spec §판정 자리는 하나뿐) —
 * 화면(카드)도 `computeNext` 도 `board` CLI 도 이 함수 하나를 거친다.
 *
 * 🔴 저장한 숫자는 손대지 않는다(INV-B2) — 반환값은 표시용 사본이고, 호출자는 이것을
 * 계획 DB 에 다시 쓰지 않는다.
 *
 * 🔴 **그 단계의 티켓이 전부 완료(`ticketChecked`)여야 비었다고 본다.** 하나라도 남았으면
 * 그 번호는 자리를 지키고, 뒤 번호는 당겨지지 않는다(spec §빈 단계가 생기는 길은 둘이다).
 *
 * 🔴 **9999 는 당기지 않는다** — 늘 9999 그대로 맨 뒤에 남는다
 * (spec §올라온 카드는 9999 단계로 붙는다). 9999 뿐인 기능은 표시 1단계가 될 수 없다.
 *
 * 🔴 작업 대상을 떠난 기능(자리 행이 `active` 가 아니거나 없는 기능)의 단계 행은 여기서도
 * 무시한다 — 단계는 작업 대상에 있는 동안만 존재한다(spec §단계는 잠시 붙었다 사라지는 것이다).
 * 문서에서 사라진 티켓의 옛 단계 행도 같은 이유로 무시한다.
 */
export function computeDisplaySteps(
  features: readonly Feature[],
  placements: readonly Placement[],
  steps: readonly StepRow[],
): DisplayStepMap {
  const activeSlugs = new Set(placements.filter((p) => p.area === "active").map((p) => p.feature));
  const featureOf = new Map(features.map((f) => [f.slug, f]));

  // `${feature}/${ticket}` → 문서가 말하는 완료 여부. 작업 대상 기능의 실제 티켓만 담는다.
  const checkedOf = new Map<string, boolean>();
  for (const slug of activeSlugs) {
    for (const t of featureOf.get(slug)?.tickets ?? []) {
      checkedOf.set(`${slug}/${t.slug}`, ticketChecked(t));
    }
  }

  const rows = steps.filter(
    (s) => activeSlugs.has(s.feature) && checkedOf.has(`${s.feature}/${s.ticket}`),
  );

  const byStep = new Map<number, StepRow[]>();
  for (const row of rows) {
    const list = byStep.get(row.step);
    if (list) list.push(row);
    else byStep.set(row.step, [row]);
  }

  const result: DisplayStepMap = {};
  const assign = (feature: string, ticket: string, display: number): void => {
    (result[feature] ??= {})[ticket] = display;
  };

  const numbered = [...byStep.keys()].filter((n) => n !== UNRANKED_STEP).sort((a, b) => a - b);
  const occupied = numbered.filter((n) =>
    (byStep.get(n) ?? []).some((row) => !checkedOf.get(`${row.feature}/${row.ticket}`)),
  );
  occupied.forEach((stored, idx) => {
    for (const row of byStep.get(stored) ?? []) assign(row.feature, row.ticket, idx + 1);
  });

  for (const row of byStep.get(UNRANKED_STEP) ?? []) assign(row.feature, row.ticket, UNRANKED_STEP);

  return result;
}
