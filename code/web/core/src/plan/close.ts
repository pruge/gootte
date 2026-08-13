import type { Feature, Placement, PlanArea, TodoStatus } from "@gootte/contract";
import { hasOpenWork } from "../project/features";
import type { PlanWritePlan } from "./move";

/**
 * 티켓 줄의 상자 하나 — 셋 중 무엇인가: 했다(`done`) · 안 한다(`dropped`) · 남았다(그 밖 전부).
 *
 * 🔴 **문서에서 읽은 상태 한 칸만 본다**(INV-5). 이 값은 어디에도 저장되지 않는다 — 작업자가
 * 티켓 문서를 `resolved`/`wontfix` 로 바꾸는 순간 다음 read 에서 그대로 바뀌고, 아무도 gootte 에
 * 알리지 않는다. 저장하면 그 순간 문서와 갈라질 두 번째 축이 생긴다.
 *
 * 🔴 **뒤집힘(캡틴 결정 2026-08-14, plan-board/12) — 옛 문단은 지우지 않고 남긴다:**
 * *"폐기(`wontfix`)는 채워진 것이 아니다. 채움은 '끝났다' 이고 폐기는 '안 한다' 라서, 둘을 같은
 * 상자로 그리면 카드가 끝나지 않은 일을 끝났다고 말한다. 폐기 티켓은 빈 상자로 남고(원문 상태가
 * 그 옆에 verbatim 으로 서 있다), 그 카드를 닫을지는 캡틴이 손으로 정하신다."*
 * 그 규율 아래서 안 할 일 한 장이 카드를 영원히 붙들었다 — 실제로 끝난 기능이 완료 칸으로
 * 못 내려가고 판에 남았다. 캡틴이 그 자리를 직접 뒤집으셨다: 폐기도 종료로 센다. **모양은 여전히
 * 갈린다** — `[x]`(했다)와 `[-]`(안 한다)는 카드를 열었을 때 무엇이 되고 무엇이 버려졌는지 보여줘야
 * 하므로 값을 셋으로 넓혔다. **판정 자리는 이 함수 하나로 유지한다**(spec §판정 자리는 하나뿐) —
 * `process` 탭·카드 대화상자·`featureFullyChecked`·표시 단계 계산 넷 다 이 값에서 파생한다.
 */
export type TicketBoxState = "done" | "dropped" | "open";

export function ticketBoxState(ticket: { readonly status: TodoStatus }): TicketBoxState {
  if (ticket.status === "done") return "done";
  if (ticket.status === "dropped") return "dropped";
  return "open";
}

/**
 * 이 기능의 상자가 **전부** 채워졌는가(`done` 이거나 `dropped`) — 저절로 닫히는 유일한 조건.
 *
 * 🔴 **티켓이 0장이면 닫지 않는다.** 빈 폴더는 "다 끝났다" 가 아니라 **끝났다는 증거가 없다** 이다
 * (`sortFeatures` 의 `RANK_NO_TICKETS` 와 같은 규율). 빈 조건을 참으로 접으면 spec 만 써 둔
 * 기능이 쓰는 순간 완료 칸으로 사라진다.
 *
 * 🔴 **뒤집힘(plan-board/12) — 옛 문단은 지우지 않고 남긴다:** *"이것은 `countOpenFeatures` 가
 * 쓰는 '남은 일이 있나'(폐기를 끝난 것으로 센다)와 다른 질문이고, 그래서 다른 함수다. … 폐기
 * 티켓에서 답이 갈리는 것이 그 증거다."* 폐기를 빈 상자로 두던 시절에는 정말 다른 질문이었다.
 * 폐기가 종료로 뒤집힌 지금은 두 질문이 폐기에서 **더 이상 갈리지 않는다** — `hasOpenWork`
 * (`project/features.ts`)가 이미 "done 도 dropped 도 아닌 티켓이 있나" 를 정확히 답하므로, 이
 * 함수는 그 답을 그대로 빌리고 **빈 폴더 가드 하나만** 얹는다. 두 함수가 남는 것은 이 가드
 * 때문이지, 폐기에서 답이 갈려서가 아니다 — 판정 자리를 둘로 늘리지 않으려고 하나를 빌려 쓴다.
 */
export function featureFullyChecked(feature: {
  readonly tickets: readonly { readonly status: TodoStatus }[];
}): boolean {
  return feature.tickets.length > 0 && !hasOpenWork(feature.tickets);
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
 * 🔴 **닫을 때 티켓 목록을 기억하지도, 새 번호가 붙었는지 감시하지도 않는다**(INV-5) — 그것은
 * 지금도 그대로다. 이 함수가 아는 것은 "지금 상자가 다 찼나" 뿐이고, 닫은 뒤에 무슨 일이
 * 생기는지는 여기서 보지 않는다.
 *
 * 🔴 **"되돌아 나오는 길을 만들지 않는다"(옛 INV-B5)는 뒤집혔다**(캡틴 결정 2026-08-13,
 * spec §INV-B7 → INV-B8, plan-board/10 → 11) — 지금은 `planReopen`(아래)이 그 길을 낸다. 이 함수
 * 자신은 여전히 **닫는 판정 하나만** 한다 — 되돌리는 판정은 다른 질문(`hasUnreadWork`, 11)이라
 * 다른 함수에 산다(spec §판정 자리는 하나뿐과 같은 이유로, 닫는 자리와 되돌리는 자리도 하나씩이다).
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
 * 안 읽은 할 일이 있다 — 읽지 않은 티켓이 하나라도 있다, 단 **폐기 티켓은 빼고 본다**
 * (plan-board/11 §방아쇠는 "안 읽음" 하나다 — 안 읽은 폐기 티켓은 올라올 이유가 아니다.
 * 폐기는 "안 한다" 이지 "할 일" 이 아니다).
 *
 * 🔴 **판정 자리를 새로 만들지 않는다.** 쓰는 값은 `ticket.unread` 그대로다 — `applyReadState`
 * (project/read-state.ts, unread-tickets-show-themselves/03)가 이미 계산해 둔, 머리글 초록이
 * 쓰는 바로 그 값이다. 이 함수가 더하는 것은 "폐기 티켓은 빼고 본다" 라는 필터 하나뿐이다.
 */
function hasUnreadWork(
  tickets: readonly { readonly status: TodoStatus; readonly unread?: boolean }[],
): boolean {
  return tickets.some((t) => t.unread === true && t.status !== "dropped");
}

const REOPEN_FROM: ReadonlySet<PlanArea> = new Set(["reserved", "discarded", "done"]);

/**
 * 판을 볼 때마다 묻는 또 한 줄 — **예약·폐기·완료의 카드에 캡틴이 아직 안 읽은 티켓이 있나**
 * (plan-board/11, 캡틴 결정 2026-08-13 — spec §INV-B8). 있으면 대기로 돌려보낼 것을, 없으면
 * `null` 을 돌려준다.
 *
 * 🔴 **10 이 세운 "자기가 놓은 카드만 도로 집는다"(`closedAt` 유무로 손/자동을 가르던 것)는
 * 같은 날 캡틴이 직접 걷어내셨다**(spec §INV-B7 → INV-B8) — *"그게 내가했든, 자동으로 했든,
 * 구분하지마."* 이 함수는 이제 `closedAt` 을 한 번도 보지 않는다. 옛 절은 지우지 않고
 * close.test.ts·spec.md 에 "무엇 위에서 지어졌는지" 로 남겨 둔다 — 뒤집힌 결정을 결함으로
 * 되돌리지 않기 위해서다.
 *
 * 🔴 **칸도 완료 하나에서 예약·폐기·완료 셋으로 넓어졌다.** 그 두 칸의 카드는 정의상 안 끝난
 * 일을 안고 있으므로, 방아쇠가 "남은 일이 있나"(`hasOpenWork`, `featureFullyChecked`)면 그
 * 두 칸이 통째로 비워진다 — 그래서 방아쇠는 `hasUnreadWork`(위, "안 읽었나") 다.
 * **처리 여부는 방아쇠가 아니다.**
 *
 * 🔴 **읽음 기록을 못 읽으면 아무 카드도 안 올라온다.** 호출자(`readPlacementsWithAutoClose`,
 * core-io)가 실어 보내는 `ticket.unread` 는 `applyReadState` 가 계산한 값이고, 그 기록이 막히면
 * `applyReadState` 는 조용한 쪽으로 기운다(INV-U1 — 전부 읽은 것으로 본다). 이 함수는 그 값을
 * 그대로 받을 뿐이라 같은 방향으로 조용해진다 — 캡틴이 정하신 자리가 통째로 날아가지 않는다.
 *
 * 🔴 **`planAutoClose` 와 같은 카드를 두고 동시에 참일 수 없다** — `planAutoClose` 는 이미
 * 완료 칸에 있는 카드를 다시 쓰지 않으므로, 그 카드에 대해 두 판정이 같은 순간 함께 참이 되는
 * 일은 없다.
 *
 * 대기로 돌아가는 것은 자리 행을 **지우는 것뿐**이다(INV-B1) — 새 칸도 새 값도 필요 없다.
 * 단계 행은 건드리지 않는다 — 예약·폐기·완료 칸 카드에는 애초에 단계 행이 없다(작업 대상 밖, INV-B6).
 */
export function planReopen(
  features: readonly Feature[],
  placements: readonly Placement[],
): PlanWritePlan | null {
  const featureOf = new Map(features.map((f) => [f.slug, f]));
  const reopening = placements
    .filter((p) => REOPEN_FROM.has(p.area))
    .filter((p) => {
      const f = featureOf.get(p.feature);
      return f !== undefined && hasUnreadWork(f.tickets);
    })
    .map((p) => p.feature)
    .sort((a, b) => a.localeCompare(b));
  if (reopening.length === 0) return null;

  return { upsert: [], remove: reopening, clearSteps: [], setSteps: [] };
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
