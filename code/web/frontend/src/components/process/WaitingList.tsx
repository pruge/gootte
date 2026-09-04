import type { KeyboardEvent } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { Feature } from "@gootte/contract";
import { featureDescription } from "../plan/cardTitle";
import { openCount } from "./openCount";

/**
 * steps 탭 왼쪽 `<aside>` **아래 칸** — 판의 **대기** 칸(`PlanBoardResponse.waiting`)을 그대로 그린다
 * (a-waiting-card-is-one-drag-away/T01), 그 카드를 **위 칸으로 끌어 올릴 수 있고**(T02),
 * **누르면 오른쪽에 그 기능의 티켓 목록이 뜬다**(T03).
 *
 * 🔴 목록은 서버가 이미 계산해 보낸 것이다(INV-1) — 이 자리가 자기 목록을 따로 들지 않는다.
 * 🔴 끌기는 **dnd-kit**(AGENTS.md 하드룰) — 놓았을 때 무엇을 할지는 부모(`ProcessView`)의
 *   `DndContext` 가 정한다. 이 자리는 "이 카드를 집을 수 있다" 만 말한다.
 * 🔴 선택도 부모가 갖는다 — 어느 카드가 골라져 있는지는 위 칸과 **한 개의 상태**다(두 목록이
 *   각자 고르면 오른쪽에 무엇을 그릴지 판정하는 자리가 둘이 된다).
 *
 * 모양은 위 칸(작업 대상)의 결을 그대로 따른다 — 같은 줄 높이·같은 남은-티켓 배지·같은 안 읽음 표시,
 * 그리고 **같은 강조**(`bg-accent/12`)로 고른 카드를 드러낸다.
 * 제목은 `plan/cardTitle.ts` 의 `featureDescription` 이 준 것을 **그대로** 싣는다(요약하지 않는다).
 *
 * 비었을 때의 한 줄은 여기가 아니라 부모가 낸다 — 대기가 0 이면 이 칸(손잡이·고정 높이 상자)
 * 자체를 만들지 않기 때문이다(빈 상자를 남기지 않는다). 🔴 그래도 **놓을 자리는 남는다** —
 * 그 한 줄이 곧 놓기 대상이다(T03, 첫 카드를 내릴 곳이 없으면 안 된다).
 */
export function WaitingList({
  features,
  selected,
  onSelect,
}: {
  features: Feature[];
  selected: string | null;
  onSelect: (slug: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {features.map((f) => (
        <li key={f.slug}>
          <WaitingCard feature={f} selected={selected === f.slug} onSelect={onSelect} />
        </li>
      ))}
    </ul>
  );
}

/**
 * 대기 카드 하나 — 잡아서 위 칸(작업 대상)으로 올리는 손잡이이자, 눌러서 티켓 목록을 여는 단추다.
 *
 * 🔴 끌기 배선은 `<li>` 가 아니라 **그 안의 상자**가 받는다 — dnd-kit 의 `attributes` 에는
 * `role="button"` 이 들어 있어, `<li>` 에 그대로 얹으면 그 줄이 더 이상 목록 항목이 아니게 된다.
 * (그 `role="button"` 덕에 이 상자는 이미 단추다 — 진짜 `<button>` 을 덧대지 않는다.)
 *
 * 🔴 **누르기와 끌기를 가르는 것은 `PointerSensor { distance: 6 }` 하나뿐이다**(부모가 정한다) —
 * 6px 못 미치게 움직였으면 클릭이라 `onClick` 이 그대로 온다. 키보드에서는 **Space 가 집기,
 * Enter 가 선택**이다(부모가 `KeyboardSensor` 의 시작 키를 Space 하나로 좁혀 둔 이유).
 *
 * `overlay` 는 손끝을 따라오는 사본이다 — 모양만 그리고 끌기·누르기 배선을 걸지 않는다(plan 탭의
 * `BoardCard` 와 같은 규율).
 */
export function WaitingCard({
  feature,
  selected = false,
  onSelect,
  overlay = false,
}: {
  feature: Feature;
  selected?: boolean;
  onSelect?: (slug: string) => void;
  overlay?: boolean;
}) {
  const description = featureDescription(feature.title, feature.slug);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: feature.slug,
    disabled: overlay,
  });

  // Enter 는 이 상자가 진짜 `<button>` 이 아니라 저절로 눌리지 않는다 — 손으로 배선한다.
  // dnd-kit 의 키 처리(Space)를 먼저 흘려 보내고, 그것이 집어 가지 않은 Enter 만 선택으로 쓴다.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    listeners?.onKeyDown?.(e);
    if (e.defaultPrevented || e.key !== "Enter") return;
    e.preventDefault();
    onSelect?.(feature.slug);
  };

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      {...(overlay ? {} : attributes)}
      {...(overlay ? {} : listeners)}
      {...(overlay ? {} : { onKeyDown, onClick: () => onSelect?.(feature.slug) })}
      aria-current={!overlay && selected ? "true" : undefined}
      aria-label={`${feature.slug} — 위 칸으로 끌어 올리면 작업 대상이 됩니다. 누르면 티켓 목록이 열립니다`}
      className={`flex touch-none flex-col gap-y-0.5 rounded-md px-2.5 py-2 text-sm ${
        overlay
          ? "w-[min(320px,70vw)] cursor-grabbing border border-accent/40 bg-surface text-muted shadow-lg"
          : `cursor-grab focus-visible:outline-2 focus-visible:outline-accent ${
              selected
                ? "bg-accent/12 font-semibold text-fg"
                : "text-muted hover:bg-surface-2 hover:text-fg"
            }`
      } ${isDragging ? "opacity-40" : ""}`}
    >
      <span className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate">{feature.slug}</span>
        <span
          title="남은 티켓 수"
          className={`mono shrink-0 rounded-full px-1.5 text-xs font-medium tabular-nums ${
            openCount(feature) > 0 ? "bg-accent/15 text-accent" : "bg-surface-2 text-muted"
          }`}
        >
          {openCount(feature)}
        </span>
        {feature.hasUnreadTicket === true && (
          <span className="mono shrink-0 rounded bg-unread-strong px-1.5 py-0.5 text-sm font-medium text-unread-fg">
            안 읽음
          </span>
        )}
      </span>
      {description && <span className="truncate text-xs text-muted/80">{description}</span>}
    </div>
  );
}
