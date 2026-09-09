import type { PlanArea, PlanBoardResponse, PlanCard, PlanMoveRequest, BoardAreaId } from "@gootte/contract";
import { AREA_LABEL, ALL_AREAS } from "@gootte/contract";

export type { BoardAreaId };
export { AREA_LABEL, ALL_AREAS };

/**
 * 화면의 칸 이름 → 저장되는 자리 값.
 * 🔴 **대기는 `null` 이다** — 저장되는 값이 아니라 자리 행이 없다는 사실 그 자체이므로(INV-B1),
 * 대기로 보내는 요청은 "행을 지워라" 라는 뜻이 된다.
 */
export const storedArea = (id: BoardAreaId): PlanArea | null => (id === "waiting" ? null : id);

/** 끌기 목적지 — 칸 자체(`area:…`)와 탭 머리(`tab:…`) 둘 다 받는다. 탭은 접힌 칸으로 가는 유일한 길이다. */
export const AREA_DROP_ID = (id: BoardAreaId) => `area:${id}`;
export const TAB_DROP_ID = (id: BoardAreaId) => `tab:${id}`;

/**
 * 놓은 자리 → 어느 칸인가. 카드 위에 놓았으면 그 카드가 있는 칸이다.
 * 알아볼 수 없으면 `null` — 아무 데도 아닌 곳에 놓은 것이라 아무 일도 일어나지 않는다.
 */
export function dropTargetArea(overId: string, cardArea: BoardAreaId | undefined): BoardAreaId | null {
  if (overId.startsWith("area:")) return overId.slice(5) as BoardAreaId;
  if (overId.startsWith("tab:")) return overId.slice(4) as BoardAreaId;
  return cardArea ?? null;
}

/**
 * 끼워 넣을 자리 — **옮길 카드들을 뺀 나머지** 기준 0-based(계약의 `index` 와 같은 셈법).
 *
 * 카드 위에 놓았을 때 앞에 넣을지 뒤에 넣을지는 **끌어온 방향**이 정한다. 늘 앞에 넣으면
 * 맨 끝자리에 놓을 방법이 사라지고, 늘 뒤에 넣으면 맨 앞자리에 놓을 방법이 사라진다.
 * 칸이나 탭 위에 놓았으면(=`over` 가 카드가 아니면) 맨 뒤다.
 */
export function insertIndex(
  destination: readonly string[],
  moved: readonly string[],
  over: string | null,
): number {
  const movedSet = new Set(moved);
  const rest = destination.filter((slug) => !movedSet.has(slug));
  if (over === null) return rest.length;
  const to = rest.indexOf(over);
  if (to < 0) return rest.length;
  const firstMovedAt = destination.findIndex((slug) => movedSet.has(slug));
  const overAt = destination.indexOf(over);
  const draggedDown = firstMovedAt !== -1 && firstMovedAt < overAt;
  return draggedDown ? to + 1 : to;
}

/**
 * 이 이동이 판을 실제로 바꾸는가 — 바꾸지 않으면 쓰지 않는다.
 * 제자리에 도로 놓은 것까지 서버에 보내면 아무것도 안 바뀐 저장이 실시간 신호를 타고 돌아와
 * 판이 이유 없이 깜빡인다.
 */
export function changesBoard(
  from: BoardAreaId,
  to: BoardAreaId,
  destination: readonly string[],
  moved: readonly string[],
  index: number,
): boolean {
  if (from !== to) return true;
  return insertAt(destination, moved, index).join(" ") !== destination.join(" ");
}

/** 목적지 칸에서 옮길 것을 빼고 그 자리에 다시 끼운 결과 — 자리 계산은 이 한 곳이 갖는다. */
function insertAt<T>(destination: readonly T[], moved: readonly T[], index: number): T[] {
  const movedSet = new Set(moved);
  const rest = destination.filter((item) => !movedSet.has(item));
  const at = Math.min(Math.max(index, 0), rest.length);
  return [...rest.slice(0, at), ...moved, ...rest.slice(at)];
}

/**
 * 옮기는 **동안** 잠깐 보여줄 판 — 카드를 놓은 칸으로 곧바로 옮겨 놓은 한 프레임.
 *
 * 🔴 **이것은 판정이 아니라 연출이다.** 서버의 답이 도착하면 이 값은 통째로 버려지고, 실패하면
 * 이전 판이 그대로 되돌아온다(`usePlanMove`). 판정 자리는 여전히 서버의 `planMove` 하나뿐이다
 * (spec §판정 자리는 하나뿐) — 여기서 **새로 지어내는 값은 하나도 없다.** `seq`·`closedAt`·단계는
 * 손대지 않고, 서버가 이미 보낸 카드 객체를 **그대로 옮겨 담기만** 한다.
 *
 * 이 프레임이 있어야 하는 이유는 손끝의 사본이 날아갈 **목적지**다 — 카드가 아직 옛 칸에 있으면
 * 놓은 사본이 옛 자리로 되돌아가 붙어, 방금 한 일을 취소한 것처럼 보인다(캡틴 지시).
 */
export function applyMoveToBoard(
  board: PlanBoardResponse,
  move: PlanMoveRequest,
): PlanBoardResponse {
  const movedSet = new Set(move.features);
  const bySlug = new Map<string, PlanCard>();
  for (const id of ALL_AREAS) {
    for (const card of board[id]) {
      if (movedSet.has(card.feature.slug)) bySlug.set(card.feature.slug, card);
    }
  }
  const picked = move.features.flatMap((slug) => bySlug.get(slug) ?? []);
  if (picked.length === 0) return board;

  const keep = (id: BoardAreaId): PlanCard[] =>
    board[id].filter((c) => !movedSet.has(c.feature.slug));
  const next: PlanBoardResponse = {
    project: board.project,
    waiting: keep("waiting"),
    active: keep("active"),
    reserved: keep("reserved"),
    discarded: keep("discarded"),
    done: keep("done"),
  };
  const to = move.area ?? "waiting";
  next[to] = insertAt(next[to], picked, move.index);
  return next;
}
