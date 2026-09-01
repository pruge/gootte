import { useRef, useState } from "react";
import { IconSearch, IconX } from "@tabler/icons-react";

interface FeatureSearchBoxProps {
  /** 확정된 검색어 — 목록 거르기가 실제로 쓰는 값. */
  value: string;
  onChange: (value: string) => void;
}

/**
 * `features` 탭 목록 위, 미해소 사본 구역과 카드 목록 둘 다의 위에 서는 검색 상자(티켓 01).
 *
 * 🔴 한글 조합 중에는 확정하지 않는다 — `compositionstart`~`compositionend` 사이에는
 * 입력창의 표시만 갱신하고 `onChange` 를 미룬다. 조립 중인 낱자마다 목록을 다시 그리면
 * 화면이 떨린다(캡틴이 짚은 문제). 조합이 끝나야 그 순간 값 하나로 확정해 올린다.
 *
 * 🟢 ESC — 검색 중일 때 한 번 누르면 검색어를 비운다(티켓 03). 포커스는 상자에 남아
 * 바로 다시 입력할 수 있다. 이미 비어 있으면 아무 일도 하지 않는다.
 */
export function FeatureSearchBox({ value, onChange }: FeatureSearchBoxProps) {
  const [text, setText] = useState(value);
  const composing = useRef(false);

  const commit = (next: string) => {
    setText(next);
    if (!composing.current) onChange(next);
  };

  const clear = () => {
    setText("");
    onChange("");
  };

  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 shadow-sm">
      <IconSearch size={16} className="shrink-0 text-muted" />
      <input
        type="text"
        name="feature-search"
        value={text}
        onChange={(e) => commit(e.target.value)}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={(e) => {
          composing.current = false;
          commit(e.currentTarget.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            clear();
          }
        }}
        placeholder="기능·티켓 검색"
        aria-label="기능·티켓 검색"
        className="min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-muted focus:outline-none"
      />
      {text !== "" && (
        <button
          type="button"
          onClick={clear}
          aria-label="검색어 지우기"
          className="shrink-0 rounded p-0.5 text-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
        >
          <IconX size={15} />
        </button>
      )}
    </div>
  );
}
