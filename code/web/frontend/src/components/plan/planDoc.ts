import type { Feature, FeatureDocNode, FeatureTicket } from "@gootte/contract";

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

/**
 * 판 카드 대화상자에서 티켓 줄을 누르면 열 원문 경로 — `issues/<티켓 slug>.md`(캡틴 결정
 * 2026-08-12: "ticket 클릭하면 문서 보이게해").
 *
 * 🔴 `feature.docs` 트리에서 찾지 않는다 — 그 트리는 **`issues/` 를 제외하고** 만들어진다
 * (contract `Feature.docs` 주석, 티켓 목록이 따로 싣기 때문). 티켓은 이미 문서를 파싱해서 나온
 * 값이라 파일이 있다는 것이 보장되고, 파일명 규칙도 하나뿐이다(`core/src/parse/ticket-path.ts`
 * 의 역방향) — 지어내는 것이 아니라 그 규칙을 그대로 되짚는 것이다.
 */
export function ticketDocPath(ticket: Pick<FeatureTicket, "slug">): string {
  return `issues/${ticket.slug}.md`;
}
