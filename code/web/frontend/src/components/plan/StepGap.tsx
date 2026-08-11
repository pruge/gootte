import { useState } from "react";
import { isTicketDrag, readTicketDragData } from "./dragPayload";

interface StepGapProps {
  /** 이 틈 바로 위 줄의 단계값 — 그 다음에 새 단계가 생긴다. 맨 위 틈이면 0. */
  afterStep: number;
  onInsertAfterStep: (feature: string, ticket: string, afterStep: number) => void;
}

/**
 * 단계 줄과 줄 **사이**의 틈 — 여기 놓으면 새 단계가 생긴다(spec 04 §무엇이 바뀌나).
 * 놓일 줄에 합쳐지는 것과 눈으로 구분되게, 끄는 동안 커지고 "여기 새 단계" 라고 말한다
 * (캡틴 확인 항목 2 — 합쳐지는 것과 구분이 안 되면 이 조작은 못 쓴다).
 */
export function StepGap({ afterStep, onInsertAfterStep }: StepGapProps) {
  const [active, setActive] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        if (!isTicketDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDrop={(e) => {
        if (!isTicketDrag(e)) return;
        e.preventDefault();
        setActive(false);
        const data = readTicketDragData(e);
        if (data) onInsertAfterStep(data.feature, data.ticket, afterStep);
      }}
      className={`mono flex items-center justify-center rounded transition-all ${
        active
          ? "h-7 border-2 border-dashed border-accent bg-accent/15 text-xs text-accent"
          : "h-2 border-2 border-dashed border-transparent"
      }`}
    >
      {active && "여기 새 단계"}
    </div>
  );
}
