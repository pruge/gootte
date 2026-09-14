import type { Memo } from "@gootte/contract";

/**
 * 메모 목록의 **계산만** 하는 자리 — 필터·정렬·카운트·포맷.
 *
 * 파일 I/O 는 `memo-store`(`readMemos`) 가 소유하고, 여기는 문자열 계산만 한다(INV-4: 판정은
 * 계산이고, 산문 `content` 는 요약하지 않고 verbatim 으로 싣는다). 화면 `memo` 탭
 * (`frontend/src/components/memo/MemoView.tsx`) 이 쓰는 세 값(`all|done|undone`)과 같은 규약을
 * 쓴다 — CLI 라고 다른 상태를 발명하지 않는다.
 */

/** 화면과 같은 세 값(`MemoView.tsx` 의 usePersistedState choices). */
export type MemoFilter = "all" | "done" | "undone";

/** 항목 머리와 continuation 을 가르는 들여쓰기(locked decision 5 — 4 칸). */
const INDENT = "    ";

/** 완료/미완료 포함 전체 건수 — **필터 이전** 값을 헤더에 그리므로 여기서 센다. */
export interface MemoCounts {
  total: number;
  done: number;
  undone: number;
}

export function memoCounts(memos: readonly Memo[]): MemoCounts {
  // 화면과 같은 판정: 완료는 `done === true` 하나만 본다(MemoView 의 filterOk).
  const done = memos.filter((m) => m.done).length;
  return { total: memos.length, done, undone: memos.length - done };
}

function matches(memo: Memo, filter: MemoFilter): boolean {
  if (filter === "done") return memo.done;
  if (filter === "undone") return !memo.done;
  return true;
}

/** 시각으로 내림차순(최신먼저). 못 읽는 값은 같은 칸으로 둔다(→ 안정 정렬이 저장 순서를 지킨다). */
function timeValue(createdAt: string): number {
  const t = Date.parse(createdAt);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * 필터 + `createdAt` 내림차순. 같은 시각은 **저장 순서**를 유지한다 — JS `Array#sort` 는
 * 안정 정렬이므로 2 차 키를 인위적으로 넣지 않는다(locked decision 3).
 * 원본 배열은 고치지 않는다(이 기능은 읽기뿐 — 저장이 없다).
 */
export function selectMemos(memos: readonly Memo[], filter: MemoFilter = "all"): Memo[] {
  return memos.filter((m) => matches(m, filter)).sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt));
}

/**
 * 메모 한 장 → 출력 행 목록. 첫 줄은 항목 머리 `- [ ] YYYY-MM-DD <첫 줄>`(완료는 `- [x]`),
 * 둘째 줄부터는 4 칸 들여쓰기 verbatim continuation — 실데이터에 이미 있는 모양(다중 줄 content)
 * 이 재접합돼도 **하나의 항목**으로 남는다. `createdAt` 앞 10 자만 쓴다(화면 날짜 그룹과 같은 규약).
 */
export function memoItemLines(memo: Memo): string[] {
  const box = memo.done ? "- [x]" : "- [ ]";
  const [head, ...rest] = memo.content.split("\n");
  const lines = [`${box} ${memo.createdAt.slice(0, 10)} ${head ?? ""}`];
  for (const line of rest) {
    // 빈 줄에 후미 공백을 남기지 않는다 — verbatim 은 내용을 말하는 것이지 공백이 아니다.
    lines.push(line === "" ? "" : `${INDENT}${line}`);
  }
  return lines;
}

/**
 * 목록 전체를 문자열로 — 헤더 한 줄 + 항목.
 *
 * - 헤더 `== <slug> · 메모 N건 (완료 A · 미완료 B) ==` 의 A/B 는 **필터 이전** 값이고,
 *   필터가 걸려 있으면 ` · 필터: done|undone` 을 붙인다(잘린 목록을 전체처럼 그리지 않는다).
 * - 메모가 하나도 없으면 `== <slug> · 메모 없음 ==` 한 줄 — 고장(`readMemos` 가 던지는 경우)은
 *   이 함수까지 오지 않는다. CLI 가 stderr + exit 1 로 갈라 빈 목록과 구별한다(locked decision 6).
 */
export function memoListText(slug: string, memos: readonly Memo[], filter: MemoFilter = "all"): string {
  if (memos.length === 0) return `== ${slug} · 메모 없음 ==`;
  const c = memoCounts(memos);
  const filterNote = filter === "all" ? "" : ` · 필터: ${filter}`;
  const header = `== ${slug} · 메모 ${c.total}건 (완료 ${c.done} · 미완료 ${c.undone})${filterNote} ==`;
  const rows = selectMemos(memos, filter).flatMap(memoItemLines);
  return [header, ...rows].join("\n");
}
