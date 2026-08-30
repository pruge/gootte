import type { Feature, PlanBoardResponse, PlanCard, Placement } from "@gootte/contract";
import { closedDisplayAt } from "./close";

/**
 * 다섯 칸 — `PlanBoardResponse` 에서 `project` 만 뺀 것. 응답 모양과 **같은 한 벌**이라
 * 여기서 나눈 결과를 서버가 그대로 싣는다(재조립 없음).
 */
export type BoardAreas = Omit<PlanBoardResponse, "project">;

/** 저장되는 자리 넷 — 대기는 여기 없다(자리 행이 없다는 것이 곧 대기다). */
const STORED_AREAS = ["active", "reserved", "discarded", "done"] as const;

/**
 * 칸 안의 카드 순서 — 캡틴이 정한 `seq` 먼저, 없거나 같으면 폴더명.
 * 자리 행이 없는 카드(`seq === null`)는 뒤로 밀되 그들끼리는 폴더명순이라 순서가 널뛰지 않는다.
 *
 * 🔴 **순서 규칙은 이 함수 하나뿐이다** — 판을 그릴 때(`splitIntoAreas`)와 카드를 끼워 넣을 때
 * (`planMove`)가 같은 규칙을 봐야 캡틴이 화면에서 센 자리와 서버가 계산한 자리가 어긋나지 않는다.
 */
export function compareBySeq(
  a: { seq: number | null; slug: string },
  b: { seq: number | null; slug: string },
): number {
  const [x, y] = [a.seq ?? Number.MAX_SAFE_INTEGER, b.seq ?? Number.MAX_SAFE_INTEGER];
  return x === y ? a.slug.localeCompare(b.slug) : x - y;
}

function bySeqThenSlug(a: PlanCard, b: PlanCard): number {
  return compareBySeq({ seq: a.seq, slug: a.feature.slug }, { seq: b.seq, slug: b.feature.slug });
}

/**
 * 완료 칸의 카드 순서 — **최근 완료가 위**(내림차순). 완료 시각은 `closedAt`(캡틴이 손으로
 * 완료 칸에 넣은 시각) 또는 문서의 `resolved` 완료일(`documentCompletedOn`)로 판단한다.
 * 시각이 없으면 맨 아래로 밀되 그들끼리는 폴더명순이다.
 *
 * 🔴 **완료 칸만** 이 규칙을 쓴다 — 캡틴이 순서를 정하는 다른 칸(작업 대상 등)은 `seq` 오름차순.
 * 완료 칸의 순서는 저장된 `seq` 가 아니라 **완료 시각**이 소유한다(캡틴 지시: 가장 최근 완료가 위).
 */
function byClosedDisplayAt(a: PlanCard, b: PlanCard): number {
  const [x, y] = [
    closedDisplayAt(a.closedAt, a.feature),
    closedDisplayAt(b.closedAt, b.feature),
  ];
  // 시각이 없으면 가장 오래된 것으로 친다 — 아래로 밀되 폴더명순(순서가 널뛰지 않게).
  if (x === null && y === null) return a.feature.slug.localeCompare(b.feature.slug);
  if (x === null) return 1;
  if (y === null) return -1;
  // ISO 날짜(+시각)라 문자열 비교가 곧 시간 비교다. 최근(큰 문자열)이 위 = 내림차순.
  return x === y ? a.feature.slug.localeCompare(b.feature.slug) : y.localeCompare(x);
}

/**
 * 기능 목록 + 자리 행 → 다섯 칸. **판정하는 자리는 여기 하나뿐이다**(spec §판정 자리는 하나뿐) —
 * 화면도 CLI 도 이 함수를 쓰고, 둘이 각자 판정하면 그 순간부터 하나는 거짓이다.
 *
 * 🔴 판정의 전부는 한 줄이다: **그 기능의 자리 행이 있으면 그 칸, 없으면 대기.**
 * 대기를 뜻하는 값은 어디에도 없다 — 없는 값은 갈라질 수 없다(INV-B1).
 *
 * 🔴 **문서가 없으면 카드도 없다.** 기능 폴더가 지워졌는데 자리 행만 남아 있으면 그 행은 아무
 * 칸에도 나타나지 않는다 — 카드가 보여줄 제목도 티켓도 전부 문서에서 오기 때문에(INV-5),
 * 행 하나로 카드를 지어내면 그 순간 계획 DB 가 문서의 2차 사본이 된다.
 * (행은 남겨 둔다 — gootte 는 관리대상을 읽기만 하므로 문서가 되돌아올 수 있다.)
 *
 * 입력을 정렬해 두지 않아도 된다 — 칸마다 여기서 결정적으로 정렬한다.
 */
export function splitIntoAreas(
  features: readonly Feature[],
  placements: readonly Placement[],
): BoardAreas {
  const rowOf = new Map(placements.map((p) => [p.feature, p]));
  const areas: BoardAreas = { waiting: [], active: [], reserved: [], discarded: [], done: [] };

  for (const feature of features) {
    const row = rowOf.get(feature.slug);
    const card: PlanCard = { feature, seq: row?.seq ?? null, closedAt: row?.closedAt ?? null };
    (row ? areas[row.area] : areas.waiting).push(card);
  }

  areas.waiting.sort(bySeqThenSlug);
  for (const key of STORED_AREAS) areas[key].sort(bySeqThenSlug);
  // 🔴 완료 칸은 `seq` 가 아니라 완료 시각(최근이 위)으로 — 캡틴 지시.
  areas.done.sort(byClosedDisplayAt);
  return areas;
}
