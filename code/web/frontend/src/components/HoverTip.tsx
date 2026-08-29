import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * 행 hover 시 보이는 개발 시간 툴팁(T02, a-ticket-tells-how-long-it-took).
 *
 * 🔴 네이티브 `title` 이 아니라 **보이는** 툴팁이다 — 글리프(`[x]`)만 26×20px 라서
 * 네이티브 title 은 사실상 안 보였다(캡틴 보고 2026-08-29). 행 전체 hover 로 즉시 뜬다.
 *
 * 🔴 스크롤 컨테이너(`overflow-y-auto`)가 네이티브 툴팁·absolute 툴팁을 잘라먹으므로
 * `position: fixed` + `document.body` 포털로 그린다(클립 없음, 대화상자 위에 떠야 하므로 z 충분히 높음).
 *
 * 🔴 값은 그대로 릴레이만 한다(INV-4) — `label` 에 이미 계산된 문구(상태 + 경과시간)가 와서
 * 여기선 `\n` 만 줄바꿈으로 펼친다. 값을 지어내지 않는다.
 */
export function useHoverTip(label: string | null) {
  // 🔴 앵커는 **행의 좌측** 바깥쪽이다 — `position: fixed` 포털이라 대화상자 `overflow-y-auto`
  // 클립을 피한다. `right` 로 잡아 툴팁의 오른쪽 끝이 행 왼쪽 끝에서 4px 밖에 오게 한다(좌측 표시).
  const [anchor, setAnchor] = useState<{ right: number; top: number } | null>(null);

  const show = (e: { currentTarget: Element }) => {
    const r = e.currentTarget.getBoundingClientRect();
    setAnchor({ right: window.innerWidth - r.left + 4, top: r.top });
  };
  const hide = () => setAnchor(null);

  const tip: ReactNode =
    label && anchor
      ? createPortal(
          // 🔴 폰트는 대화상자 헤더(`CardDialog` `<h2>` 설명 — `font-medium tracking-tight`)를
          // 계승한다. 툴팁은 body 포털이라 상속이 안 닿으므로 같은 토큰을 명시한다.
          <span
            role="tooltip"
            style={{ position: "fixed", right: anchor.right, top: anchor.top }}
            className="pointer-events-none z-[60] block max-w-xs rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium tracking-tight text-fg shadow-lg"
          >
            {label.split("\n").map((line, i) => (
              <span key={i} className="block">
                {line}
              </span>
            ))}
          </span>,
          document.body,
        )
      : null;

  return {
    triggerProps: {
      onMouseEnter: show,
      onMouseLeave: hide,
      onFocus: show,
      onBlur: hide,
    } as const,
    tip,
  };
}
