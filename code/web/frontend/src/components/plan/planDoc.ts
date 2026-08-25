import type { Feature, FeatureDocNode } from "@gootte/contract";

/**
 * 카드 머리의 문서 아이콘이 열 문서 경로 — 여기서 정하는 것은 "어느 문서로 갈까" 하나뿐이고,
 * 읽고 그리는 일은 `plan` 탭이 이미 재사용하고 있는 드로어(`DocDrawer`)가 그대로 한다(티켓 03).
 * 🔴 두 번째 문서 보기를 짓지 않는다 — 탭도 옮기지 않는다. `PlanView` 가 이 경로로 드로어를
 * 그 자리에서 연다.
 *
 * `spec.md` 가 있으면 그것 — 기능이 무엇인가를 말하는 문서다. 없으면 폴더에 실제로 있는 첫 파일.
 * 🔴 **없는 문서를 지어내지 않는다** — 파일이 하나도 없으면 `null` 이고, 그때 화면은 아무것도
 * 열지 않는다(빈 드로어가 "문서가 없다" 를 오류처럼 보이게 하지 않게).
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
