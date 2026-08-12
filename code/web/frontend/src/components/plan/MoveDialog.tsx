import { useEffect, useRef } from "react";
import { IconX } from "@tabler/icons-react";
import { ALL_AREAS, AREA_LABEL, type BoardAreaId } from "./areas";

interface MoveDialogProps {
  /** 옮길 기능들 — 여러 장 고른 상태면 그 전부다. */
  features: readonly string[];
  /** 지금 있는 칸 — 🔴 고를 수 없다(티켓 03 §카드 머리 아이콘 둘). */
  from: BoardAreaId;
  onMove: (to: BoardAreaId) => void;
  onClose: () => void;
}

/**
 * "어느 칸으로 보낼까요" — 끌기의 **대체 경로**다(티켓 03).
 * 카드가 많아 끌기 힘들 때와, 완료 칸의 접힌 카드를 다시 꺼낼 때 쓰인다.
 *
 * 🔴 **묻는 것은 어디로 갈지 하나뿐이다.** 옮겨도 되는지 확인하지 않고(INV-B3), 왜 옮기는지도
 * 묻지 않는다 — 완료로 보낼 때조차 그렇다(캡틴 결정). 왜 남기고 닫았는지는 티켓 문서에 적히고,
 * 문서 아이콘이 그리로 가는 길이다.
 */
export function MoveDialog({ features, from, onMove, onClose }: MoveDialogProps) {
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => firstRef.current?.focus(), []);

  const targets = ALL_AREAS.filter((id) => id !== from);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="대화상자 닫기"
        className="absolute inset-0 bg-fg/25 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-dialog-heading"
        className="relative w-[min(420px,92vw)] overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="min-w-0">
            <h2 id="move-dialog-heading" className="font-medium tracking-tight">
              어느 칸으로 보낼까요
            </h2>
            {/* 무엇이 옮겨지는지 이름 그대로 보여준다 — "2장" 만 말하면 무엇인지 다시 닫아 봐야 한다. */}
            <p className="mono mt-1 text-sm break-words text-muted">{features.join(", ")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="shrink-0 rounded p-1.5 text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            <IconX size={18} />
          </button>
        </header>
        <ul className="p-2">
          {targets.map((id, i) => (
            <li key={id}>
              <button
                ref={i === 0 ? firstRef : undefined}
                type="button"
                onClick={() => onMove(id)}
                className="flex w-full items-baseline gap-2 rounded-md px-3 py-2 text-left hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
              >
                <span className="font-medium tracking-tight">{AREA_LABEL[id]}</span>
                {id === "waiting" && (
                  <span className="text-sm text-muted">— 자리를 비운다</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
