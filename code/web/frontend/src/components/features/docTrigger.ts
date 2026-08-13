/**
 * 문서를 연 버튼의 신원 — DOM 요소 자체가 아니라 "무엇을 열었는지"(기능 슬러그 + 경로).
 * 가상 스크롤로 카드가 스크롤을 벗어났다 돌아오면 버튼은 새 DOM 노드로 다시 태어나므로,
 * 드로어를 닫을 때 붙들 값은 옛 요소가 아니라 이 신원이어야 한다(a-long-list-stays-usable/02 ②).
 *
 * 널 문자(U+0000)로 갈라 붙인다 — featureSlug·path 어느 쪽에도 나타나지 않는 문자라 값
 * 안에 같은 구분자가 우연히 들어 있어도 자리가 안 어긋난다.
 */

export interface DocTrigger {
  featureSlug: string;
  path: string;
}

const SEP = "\u0000";

export function triggerKey(t: DocTrigger): string {
  return `${t.featureSlug}${SEP}${t.path}`;
}

/** 스크롤이 그 카드를 다시 그린 뒤, 컨테이너 안에서 같은 신원의 버튼을 찾는다. */
export function findTrigger(container: Element, target: DocTrigger): HTMLElement | null {
  const key = triggerKey(target);
  const candidates = container.querySelectorAll<HTMLElement>("[data-doc-trigger]");
  for (const el of candidates) {
    if (el.dataset.docTrigger === key) return el;
  }
  return null;
}
