import type { Feature, Placement, PlanArea, TodoStatus } from "@gootte/contract";
import type { PlanWritePlan } from "./move";

/**
 * 티켓 줄의 상자 하나 — 채워졌는가.
 *
 * 🔴 **문서에서 읽은 상태 한 칸만 본다**(INV-5). 이 값은 어디에도 저장되지 않는다 — 작업자가
 * 티켓 문서를 `resolved` 로 바꾸는 순간 다음 read 에서 그대로 채워지고, 아무도 gootte 에
 * 알리지 않는다. 저장하면 그 순간 문서와 갈라질 두 번째 축이 생긴다.
 *
 * 🔴 **폐기(`wontfix`)는 채워진 것이 아니다.** 채움은 "끝났다" 이고 폐기는 "안 한다" 라서,
 * 둘을 같은 상자로 그리면 카드가 끝나지 않은 일을 끝났다고 말한다. 폐기 티켓은 빈 상자로 남고
 * (원문 상태가 그 옆에 verbatim 으로 서 있다), 그 카드를 닫을지는 캡틴이 손으로 정하신다
 * (spec §완료가 둘로 갈리는 자리).
 */
export function ticketChecked(ticket: { readonly status: TodoStatus }): boolean {
  return ticket.status === "done";
}

/**
 * 이 기능의 상자가 **전부** 채워졌는가 — 저절로 닫히는 유일한 조건.
 *
 * 🔴 **티켓이 0장이면 닫지 않는다.** 빈 폴더는 "다 끝났다" 가 아니라 **끝났다는 증거가 없다** 이다
 * (`sortFeatures` 의 `RANK_NO_TICKETS` 와 같은 규율). 빈 조건을 참으로 접으면 spec 만 써 둔
 * 기능이 쓰는 순간 완료 칸으로 사라진다.
 *
 * 🔴 이것은 `countOpenFeatures` 가 쓰는 "남은 일이 있나"(폐기를 끝난 것으로 센다)와 **다른 질문**
 * 이고, 그래서 다른 함수다. 저쪽은 *착수할 것이 남았나*(features 탭의 정렬·집계), 이쪽은
 * *상자가 전부 채워졌나*(판을 닫는 판정)다. 폐기 티켓에서 답이 갈리는 것이 그 증거다 —
 * 같은 질문을 두 번 답하는 것이 아니라, 애초에 다른 질문이다.
 */
export function featureFullyChecked(feature: {
  readonly tickets: readonly { readonly status: TodoStatus }[];
}): boolean {
  return feature.tickets.length > 0 && feature.tickets.every(ticketChecked);
}

/**
 * **문서가 말하는** 완료 시각 — 완료 티켓들의 `resolved (YYYY-MM-DD[ HH:MM])` 중 가장 늦은 것.
 * 문서에 시각이 없으면 날짜만 담긴다 — 지어내지 않는다(06). 하나도 없으면 null 이다.
 *
 * ISO 날짜(+시각)라 문자열 비교가 곧 시간 비교다.
 */
export function documentCompletedOn(feature: {
  readonly tickets: readonly { readonly completedAt?: string }[];
}): string | null {
  let latest: string | null = null;
  for (const t of feature.tickets) {
    if (t.completedAt && (latest === null || t.completedAt > latest)) latest = t.completedAt;
  }
  return latest;
}

/**
 * 저절로 닫힐 수 있는 자리 — **아무도 정하지 않은 자리(대기)와 지금 붙들고 가는 자리(작업 대상)뿐이다.**
 *
 * 🔴 예약·폐기·완료는 **캡틴이 손으로 정한 자리**라 gootte 가 덮지 않는다. 캡틴이 내려 둔 카드나
 * 폐기한 카드를 문서가 이유가 되어 끌어 올리면, 그것은 캡틴이 지적하신 문제 ①(기계가 몰래 자리를
 * 옮긴다)이 자동 닫힘의 얼굴로 되살아나는 것이다. 그런 카드는 상자가 다 채워진 채 그 칸에 남고,
 * 캡틴이 보고 정하신다.
 */
function closableFrom(row: Placement | undefined): boolean {
  return row === undefined || row.area === "active";
}

const DONE: PlanArea = "done";

/**
 * 판을 볼 때마다 묻는 한 줄 — **지금 저절로 닫힐 기능이 있나.** 있으면 계획 DB 에 쓸 것을,
 * 없으면 `null`(= 아무것도 쓰지 않는다)을 돌려준다.
 *
 * 🔴 **gootte 가 스스로 계획 DB 에 쓰는 유일한 자리다**(spec §gootte 가 스스로 쓰는 단 한 순간).
 * 쓰는 것은 `area=완료` **하나뿐** — 체크 상태도, 닫힌 시각도 저장하지 않는다(INV-5, 06).
 * 🔴 **`closedAt` 을 찍지 않는다.** 저절로 닫힐 때 gootte 가 아는 시각은 "지금 알아챈 때" 이지
 * "일이 끝난 때" 가 아니다 — 문서의 `resolved (YYYY-MM-DD[ HH:MM])` 이 더 정확하다(06).
 * 화면이 보여줄 닫힌 시각은 `closedDisplayAt` 이 문서에서 채운다.
 *
 * 🔴 **되돌아 나오는 길을 만들지 않는다**(INV-B5). 닫을 때 티켓 목록을 기억하지도, 새 번호가
 * 붙었는지 감시하지도 않는다. 닫힌 뒤 규율을 어겨 티켓이 하나 붙으면 그 카드는 완료 칸에 머문 채
 * 빈 상자를 하나 보여 준다 — 여기서 다시 대기로 되돌리는 계산은 없다.
 *
 * 🔴 이미 완료 칸에 있는 카드는 **다시 쓰지 않는다** — 캡틴이 손으로 닫아 `closedAt` 을 가진
 * 카드도, 저절로 닫혀 `closedAt` 이 없는 카드도, 볼 때마다 다시 upsert 하지 않는다.
 */
export function planAutoClose(
  features: readonly Feature[],
  placements: readonly Placement[],
): PlanWritePlan | null {
  const rowOf = new Map(placements.map((p) => [p.feature, p]));
  const closing = features
    .filter((f) => featureFullyChecked(f) && closableFrom(rowOf.get(f.slug)))
    .map((f) => f.slug)
    // 한 번에 여럿이 닫혀도 순서가 널뛰지 않게 — 자리 번호는 결정적으로 매긴다.
    .sort((a, b) => a.localeCompare(b));
  if (closing.length === 0) return null;

  // 닫히는 카드는 완료 칸 **맨 뒤**에 선다 — 이미 닫혀 있던 카드의 자리를 밀어내지 않는다.
  let seq = placements.reduce((max, p) => (p.area === DONE ? Math.max(max, p.seq) : max), -1);

  return {
    upsert: closing.map((feature) => ({ feature, area: DONE, seq: ++seq, closedAt: null })),
    remove: [],
    // 작업 대상을 떠났으므로 단계 행은 사라진다(spec §단계는 잠시 붙었다 사라지는 것이다).
    clearSteps: closing.filter((slug) => rowOf.get(slug)?.area === "active"),
    setSteps: [],
  };
}

/**
 * 완료 칸 카드가 보여줄 닫힌 시각 **하나** — 저절로 닫혔으면(`closedAt` 없음) 문서가 말하는
 * 완료 시각에서, 캡틴이 손으로 닫았으면 저장된 `closedAt` 그대로(06).
 *
 * 🔴 **판정 자리는 여기 하나다** — `BoardCard`·`CardDialog` 둘 다 이 함수를 부를 뿐, 화면이
 * 스스로 `closedAt` 과 문서 날짜 중 하나를 고르지 않는다(spec §판정 자리는 하나뿐).
 * 🔴 완료 칸 밖의 카드에는 부르지 않는다 — 부분 완료 상태의 문서 날짜를 "닫힘"으로 잘못 읽지
 * 않도록, 호출자가 완료 칸 카드에만 쓴다.
 */
export function closedDisplayAt(
  closedAt: string | null,
  feature: { readonly tickets: readonly { readonly completedAt?: string }[] },
): string | null {
  return closedAt ?? documentCompletedOn(feature);
}
