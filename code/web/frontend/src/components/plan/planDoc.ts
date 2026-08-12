import type { Feature, FeatureDocNode } from "@gootte/contract";

/**
 * 카드 머리의 문서 아이콘이 열 문서 — **`features` 탭의 기존 통로**로 넘길 주소다(티켓 03).
 * 🔴 두 번째 문서 보기를 짓지 않는다. 여기서 정하는 것은 "어느 문서로 갈까" 하나뿐이고,
 * 읽고 그리는 일은 이미 있는 드로어(`DocDrawer`)가 그대로 한다.
 *
 * `spec.md` 가 있으면 그것 — 기능이 무엇인가를 말하는 문서다. 없으면 폴더에 실제로 있는 첫 파일.
 * 🔴 **없는 문서를 지어내지 않는다** — 파일이 하나도 없으면 `null` 이고, 그때 화면은 문서를
 * 여는 대신 `features` 탭으로만 건너간다(빈 드로어가 "문서가 없다" 를 오류처럼 보이게 하지 않게).
 */
export function featureDocPath(feature: Feature): string | null {
  const files: string[] = [];
  const walk = (nodes: readonly FeatureDocNode[]): void => {
    for (const node of nodes) {
      if (node.kind === "file") files.push(node.path);
      else walk(node.children ?? []);
    }
  };
  walk(feature.docs);
  return files.find((p) => p === "spec.md") ?? files[0] ?? null;
}
