import type { Feature, Placement } from "@gootte/contract";
import { allTickets } from "../project/features";
import { ticketBoxState } from "./close";
import { UNRANKED_STEP, type StepRow } from "./move";

/**
 * feature slug → ticket slug → 화면에 보일 단계(당김까지 끝난 값, plan-board/05).
 * 값이 없는 조합은 이 표에 없다 — 빈 단계로 당겨져 사라졌거나 작업 대상 밖이다.
 */
export type DisplayStepMap = Record<string, Record<string, number>>;

/**
 * 작업 대상 기능의 실제 티켓에 붙은 단계 행만 남기고, 완료 여부를 함께 조회할 수 있게 한다 —
 * `computeDisplaySteps` 와 `placeStep` 이 같은 필터를 두 번 쓰지 않게 한 곳에 모았다.
 */
function indexActiveSteps(
  features: readonly Feature[],
  placements: readonly Placement[],
  steps: readonly StepRow[],
): { rows: StepRow[]; checkedOf: Map<string, boolean> } {
  const activeSlugs = new Set(placements.filter((p) => p.area === "active").map((p) => p.feature));
  const featureOf = new Map(features.map((f) => [f.slug, f]));

  // `${feature}/${ticket}` → 그 자리가 비었는가(`done` 이거나 `dropped`). 작업 대상 기능의
  // 실제 티켓만 담는다. 폐기도 당김에서는 완료와 같다(plan-board/12) — 폐기뿐인 단계도 빈다.
  const checkedOf = new Map<string, boolean>();
  for (const slug of activeSlugs) {
    // 🔴 문서가 사라진 기능(배치 행은 남았지만 파싱 결과에 없는 slug)은 조용히 건너뛴다 —
    // 그 카드 하나 때문에 판 전체(`/api/plan/:slug`)가 죽지 않게 한다(a-vanished-card-breaks-nothing).
    // 배치 행은 지우지 않는다 — 문서가 돌아오면 카드도 돌아온다.
    const f = featureOf.get(slug);
    if (!f) continue;
    // 두 관례를 합쳐 본다 — 신관례 전용 기능의 단계도 여기서 걸러지지 않아야 한다.
    for (const t of allTickets(f)) {
      checkedOf.set(`${slug}/${t.slug}`, ticketBoxState(t) !== "open");
    }
  }

  const rows = steps.filter((s) => activeSlugs.has(s.feature) && checkedOf.has(`${s.feature}/${s.ticket}`));
  return { rows, checkedOf };
}

function groupByStep(rows: readonly StepRow[]): Map<number, StepRow[]> {
  const byStep = new Map<number, StepRow[]>();
  for (const row of rows) {
    const list = byStep.get(row.step);
    if (list) list.push(row);
    else byStep.set(row.step, [row]);
  }
  return byStep;
}

/**
 * 저장된 단계 숫자 → 화면에 보일 단계. **판정 자리는 여기 하나뿐이다**(spec §판정 자리는 하나뿐) —
 * 화면(카드)도 `computeNext` 도 `board` CLI 도 이 함수 하나를 거친다.
 *
 * 🔴 저장한 숫자는 손대지 않는다(INV-B2) — 반환값은 표시용 사본이고, 호출자는 이것을
 * 계획 DB 에 다시 쓰지 않는다.
 *
 * 🔴 **그 단계의 티켓이 전부 채워졌어야(`ticketBoxState` !== "open") 비었다고 본다.** 하나라도 남았으면
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
  const { rows, checkedOf } = indexActiveSteps(features, placements, steps);

  const result: DisplayStepMap = {};
  const assign = (feature: string, ticket: string, display: number): void => {
    (result[feature] ??= {})[ticket] = display;
  };

  // 🔴 **기능별(level) 재번호** — 각 활성 기능의 남은(open) 티켓을 저장 단계 오름차순으로
  // 1,2,3… 매긴다. 완료·폐기 티켓은 표시 단계를 받지 않아 steps 탭에서 사라진다(plan-board/07·12).
  // 전역 단계 모델이 아니라 기능별 모델이라, 한 기능에 남은 티켓이 하나뿐이어도 그 기능 안에서는
  // 1단계다 — 다른 기능이 1·2단계를 점유해도 밀리지 않는다(사용자 요구 "각 feature에서 level 앞당기기").
  // 저장 숫자(`steps` 원본)는 그대로 살아 있어 `placeStep` 이 충돌 없이 쓴다.
  const byFeature = new Map<string, StepRow[]>();
  for (const row of rows) {
    if (checkedOf.get(`${row.feature}/${row.ticket}`)) continue; // done/dropped: 화면에서 걷음
    const list = byFeature.get(row.feature);
    if (list) list.push(row);
    else byFeature.set(row.feature, [row]);
  }
  for (const [feature, fRows] of byFeature) {
    const numbered = fRows
      .filter((r) => r.step !== UNRANKED_STEP)
      .sort((a, b) => a.step - b.step);
    numbered.forEach((r, idx) => assign(feature, r.ticket, idx + 1));
    for (const r of fRows) {
      if (r.step === UNRANKED_STEP) assign(feature, r.ticket, UNRANKED_STEP);
    }
  }

  return result;
}

/**
 * 캡틴이 `process` 탭에서 놓은 자리 — 08 이 새로 세우는 판정 입력(spec §놓을 수 있는 자리).
 *
 * - `onStep` — 화면의 k단계(1-based) **위**에 놓았다.
 * - `gap` — 번호 매겨진 단계들 **사이의 틈**에 놓았다. `index` 는 그 틈의 앞에 몇 개의 표시
 *   단계가 있는가다 — 0 이면 1단계보다 앞(맨 앞), 표시 단계 수와 같으면 번호 매겨진 단계들
 *   맨 뒤(9999 무더기 앞)다.
 * - `unranked` — `9999` 무더기 위에 놓았다.
 */
export type StepPlacement =
  | { readonly kind: "onStep"; readonly displayStep: number }
  | { readonly kind: "gap"; readonly index: number }
  | { readonly kind: "unranked" };

/**
 * 캡틴이 놓은 자리 → 저장할 단계 숫자(plan-board/08, spec §놓은 자리를 저장 숫자로 옮기는 계산).
 * **판정 자리는 여기 하나뿐이다** — 화면은 "어느 자리에 놓았다" 만 말하고, 저장 숫자는 이 함수가
 * 정한다. `computeDisplaySteps` 와 마찬가지로 화면(process 탭)과 명령(`step`)이 이 함수 뒤의
 * 같은 쓰기 자리(`writeStep`)로 들어간다(spec §명령과 화면이 같은 자리를 쓴다).
 *
 * 🔴 저장 숫자 칸은 정수에서 실수로 바뀐 것이다(spec §사이에 끼워 넣으려면 저장 숫자가
 * 정수여선 안 된다) — **사이**에 놓으면 앞뒤 두 저장 숫자의 중간값을 돌려준다. 그래서 어느
 * 자리에 놓아도 이 함수가 다시 쓰는 저장 숫자는 끈 티켓 하나 몫뿐이고, 다른 행은 손대지 않는다
 * (INV-B2).
 *
 * 🔴 **"가장 큰/작은 것" 은 화면에 보이는 단계(`occupied`)가 아니라 저장된 단계 전부**
 * (`allNumbered`, 완료돼 화면에서 걷힌 단계까지)에서 센다 — 안 그러면 새 단계가 옛 숫자와
 * 부딪친다(spec §"가장 큰 것"·"가장 작은 것" 은...).
 *
 * 🔴 **놓을 수 있는지 검사하지 않는다**(INV-B3) — 이 함수는 자리를 숫자로 바꿀 뿐, 거절하지 않는다.
 */
export function placeStep(
  features: readonly Feature[],
  placements: readonly Placement[],
  steps: readonly StepRow[],
  placement: StepPlacement,
  feature: string,
): number {
  if (placement.kind === "unranked") return UNRANKED_STEP;

  const { rows, checkedOf } = indexActiveSteps(features, placements, steps);
  const featureRows = rows.filter((r) => r.feature === feature);
  const byStep = groupByStep(featureRows);

  // 🔴 **기능별 모델** — 끄는 티켓이 속한 기능 안에서만 자리를 정한다. 저장 숫자 칸은
  // (project, feature, ticket) 별이라 다른 기능 숫자와 부딪치지 않으므로 전역으로 볼 이유가 없다.
  const allNumbered = [...new Set(featureRows.map((r) => r.step))]
    .filter((n) => n !== UNRANKED_STEP)
    .sort((a, b) => a - b);
  const occupied = allNumbered.filter((n) =>
    (byStep.get(n) ?? []).some((row) => !checkedOf.get(`${row.feature}/${row.ticket}`)),
  );

  if (placement.kind === "onStep") {
    if (occupied.length === 0) return 1;
    const idx = Math.min(Math.max(placement.displayStep - 1, 0), occupied.length - 1);
    return occupied[idx] as number;
  }

  // gap — 번호 매겨진 단계가 하나도 없으면 앞이든 뒤든 갈 곳은 하나뿐이다(캡틴 결정: 1).
  if (occupied.length === 0) return 1;
  const smallest = allNumbered[0] as number;
  const largest = allNumbered[allNumbered.length - 1] as number;
  if (placement.index <= 0) return smallest - 1;
  if (placement.index >= occupied.length) return largest + 1;
  const before = occupied[placement.index - 1] as number;
  const after = occupied[placement.index] as number;
  return (before + after) / 2;
}
