import { splitByQuery } from "./featureSearch";

interface HighlightedTextProps {
  text: string;
  query: string;
}

/**
 * 검색어와 걸린 자리를 노란 칩으로 보여준다(a-long-list-stays-usable/01, 캡틴 지시).
 * 글자 크기는 그대로 두고 배경·둥근 모서리만 얹는다 — `inline` 이라 줄바꿈 폭 계산을 흔들지 않는다.
 */
export function HighlightedText({ text, query }: HighlightedTextProps) {
  const segments = splitByQuery(text, query);
  if (segments.length === 1 && segments[0]?.matched !== true) return <>{text}</>;

  return (
    <>
      {segments.map((seg, i) =>
        seg.matched ? (
          <mark
            key={i}
            className="rounded bg-search-mark px-0.5 py-px text-inherit text-search-mark-fg"
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}
