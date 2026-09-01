import type { Feature } from "@gootte/contract";
import { allTickets } from "@gootte/core";

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

/** 조각 하나 — `matched` 가 참이면 검색어와 글자 그대로 같다(칩으로 표시할 자리). */
export interface TextSegment {
  text: string;
  matched: boolean;
}

/**
 * 검색어로 글자를 조각낸다 — 걸러내기와 **같은 규칙**(대소문자 무관 부분 일치, 정규식 아님)을
 * 쓴다(`includesQuery` 와 같은 비교). 걸린 자리를 칩으로 보여줄 때 이 조각을 그대로 쓴다.
 */
export function splitByQuery(text: string, query: string): TextSegment[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery === "") return [{ text, matched: false }];

  const lower = text.toLowerCase();
  const segments: TextSegment[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const idx = lower.indexOf(normalizedQuery, cursor);
    if (idx === -1) {
      segments.push({ text: text.slice(cursor), matched: false });
      break;
    }
    if (idx > cursor) segments.push({ text: text.slice(cursor, idx), matched: false });
    segments.push({ text: text.slice(idx, idx + normalizedQuery.length), matched: true });
    cursor = idx + normalizedQuery.length;
  }
  return segments;
}

/**
 * 기능 이름(spec 표제) + **슬러그(폴더명)** + 티켓 제목(접힌 카드 안까지)으로 기능 목록을
 * 거른다(티켓 01). 슬러그도 범위에 넣는다 — 카드 머리글의 배지로 보이는 `plan-board` 같은
 * 값으로도 찾아야 화면에 보이는 이름으로 검색이 된다(2026-09-02 캡틴 보고: title 이 slug 를
 * 포함하지 않는 기능 — `plan-board`·`development-order` — 을 slug 로 검색하면 안 잡혔다).
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
    const nameMatches =
      includesQuery(feature.title, normalizedQuery) ||
      includesQuery(feature.slug, normalizedQuery);
    const ticketMatches = allTickets(feature).some((t) => includesQuery(t.title, normalizedQuery));
    if (nameMatches || ticketMatches) {
      matches.push({ feature, forceExpanded: ticketMatches });
    }
  }
  return matches;
}
