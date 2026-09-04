import type { Feature, FeatureDocNode } from "@gootte/contract";

/** 티켓이 사는 폴더 — 문서 목록에서 뺀다(아래 `featureDocList`). */
const TICKET_DIRS = ["issues", "tickets"];

/** 문서 목록의 한 줄 — 드로어가 받는 경로와 화면에 쓸 이름. */
export interface FeatureDocEntry {
  /** 기능 폴더 기준 상대 경로 — 문서 읽기 API 의 `path` 그대로. */
  path: string;
  /** 파일명("spec.md") */
  name: string;
  /** 상위 폴더("adr" · 루트면 null) — 목록에서 어디 것인지 알려 준다. */
  dir: string | null;
}

/**
 * 이 기능의 **읽을 수 있는 문서 전부** — `spec.md` · `adr/*` · `decisions-*.md` · `reviews/*` …
 *
 * 🔴 **티켓 폴더(`issues/` · `tickets/`)는 뺀다**(캡틴 결정 2026-09-04). 티켓은 세 탭이 이미
 * 각자 자기 방식으로 보여 주고 있어, 여기 또 실으면 같은 것이 두 번 뜬다.
 *
 * 🔴 **판정 자리는 여기 하나다** — `plan` 과 `steps` 가 같은 목록을 본다. 탭마다 따로 고르면
 * 같은 기능인데 탭에 따라 다른 문서가 보인다.
 *
 * 순서는 트리 순서 그대로이되 **`spec.md` 만 맨 앞으로** 끌어올린다 — "이 기능이 무엇인가" 를
 * 말하는 문서라 목록에서 먼저 보이는 것이 맞다.
 */
export function featureDocList(feature: Feature): FeatureDocEntry[] {
  const out: FeatureDocEntry[] = [];
  const walk = (nodes: readonly FeatureDocNode[], dir: string | null): void => {
    for (const node of nodes) {
      if (node.kind === "dir") {
        if (dir === null && TICKET_DIRS.includes(node.name)) continue; // 티켓 폴더는 통째로 건너뛴다
        walk(node.children ?? [], node.name);
      } else {
        out.push({ path: node.path, name: node.name, dir });
      }
    }
  };
  walk(feature.docs, null);
  const specAt = out.findIndex((d) => d.path === "spec.md");
  if (specAt > 0) out.unshift(...out.splice(specAt, 1));
  return out;
}

/**
 * 문서가 **하나뿐일 때** 곧장 열 경로 — 목록을 띄울 이유가 없으므로 클릭 한 번으로 연다.
 * 🔴 **없는 문서를 지어내지 않는다** — 하나도 없으면 `null` 이고, 그때 화면은 아무것도 열지 않는다
 * (빈 드로어가 "문서가 없다" 를 오류처럼 보이게 하지 않게).
 */
export function featureDocPath(feature: Feature): string | null {
  return featureDocList(feature)[0]?.path ?? null;
}
