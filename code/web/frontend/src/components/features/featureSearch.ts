import type { Feature } from "@gootte/contract";

/**
 * 검색 걸러내기 결과 — 카드 하나가 왜 남았는지까지 들고 있다.
 * `forceExpanded` 가 참이면 티켓 제목 때문에 걸렸다는 뜻이라, 카드가 접힌 채면
 * 캡틴이 왜 걸렸는지 못 본다(티켓 01 §핵심) — 그래서 펼쳐서 띄운다.
 */
export interface FeatureSearchMatch {
  feature: Feature;
  forceExpanded: boolean;
}

/** 대소문자 무관 부분 일치 — 정규식이 아니라 글자 포함 검사라 특수문자를 넣어도 안 깨진다. */
function includesQuery(text: string, normalizedQuery: string): boolean {
  return text.toLowerCase().includes(normalizedQuery);
}

/**
 * 기능 이름 + 티켓 제목(접힌 카드 안까지)으로 기능 목록을 거른다(티켓 01).
 * 서버를 다시 부르지 않는다 — 이미 받은 `features` 배열 안에서만 거른다(INV-1).
 * 검색어가 비어 있으면 원래 목록을 그대로 돌려준다(펼침 강제도 없다).
 */
export function filterFeaturesBySearch(
  features: readonly Feature[],
  query: string,
): FeatureSearchMatch[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery === "") {
    return features.map((feature) => ({ feature, forceExpanded: false }));
  }

  const matches: FeatureSearchMatch[] = [];
  for (const feature of features) {
    const nameMatches = includesQuery(feature.title, normalizedQuery);
    const ticketMatches = feature.tickets.some((t) => includesQuery(t.title, normalizedQuery));
    if (nameMatches || ticketMatches) {
      matches.push({ feature, forceExpanded: ticketMatches });
    }
  }
  return matches;
}
