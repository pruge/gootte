/**
 * 기능 카드 트리의 깊이별 왼쪽 들여쓰기 — 유일한 출처(feature-doc-browser/02).
 *
 * `issues/` 아래 파일 줄(깊이 1) · `check` 아래 티켓 줄 · 티켓 없음 빈 문구가 모두 이 값을 쓴다.
 * 두 번째로 값을 적어 넣지 않는다 — 그러면 손글씨가 둘이 되어 다시 어긋난다.
 */
export const TREE_INDENT_BASE_REM = 1;
export const TREE_INDENT_STEP_REM = 1.25;

export function treeIndentRem(depth: number): number {
  return TREE_INDENT_BASE_REM + depth * TREE_INDENT_STEP_REM;
}

export function treeIndentStyle(depth: number): { paddingLeft: string } {
  return { paddingLeft: `${treeIndentRem(depth)}rem` };
}

/** `check` 아래 티켓 줄·빈 문구가 `issues/` 아래 파일 줄과 같은 깊이에서 시작한다(feature-doc-browser/02). */
export const TICKET_LIST_DEPTH = 1;
