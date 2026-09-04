import { useDraggable } from "@dnd-kit/core";
import type { Feature } from "@gootte/contract";
import { featureDescription } from "../plan/cardTitle";
import { openCount } from "./openCount";

/**
 * steps 탭 왼쪽 `<aside>` **아래 칸** — 판의 **대기** 칸(`PlanBoardResponse.waiting`)을 그대로 그린다
 * (a-waiting-card-is-one-drag-away/T01), 그리고 그 카드를 **위 칸으로 끌어 올릴 수 있다**(T02).
 *
 * 🔴 목록은 서버가 이미 계산해 보낸 것이다(INV-1) — 이 자리가 자기 목록을 따로 들지 않는다.
 * 🔴 끌기는 **dnd-kit**(AGENTS.md 하드룰) — 놓았을 때 무엇을 할지는 부모(`ProcessView`)의
 *   `DndContext` 가 정한다. 이 자리는 "이 카드를 집을 수 있다" 만 말한다.
 * 🔴 올리는 방향 하나뿐이다 — 작업 대상에서 대기로 **내리는** 끌기는 범위 밖이고, 그 길은
 *   `MoveDialog` 가 이미 갖고 있다.
 *
 * 모양은 위 칸(작업 대상)의 결을 그대로 따른다 — 같은 줄 높이·같은 남은-티켓 배지·같은 안 읽음 표시.
 * 제목은 `plan/cardTitle.ts` 의 `featureDescription` 이 준 것을 **그대로** 싣는다(요약하지 않는다).
 *
 * 비었을 때의 한 줄은 여기가 아니라 부모가 낸다 — 대기가 0 이면 이 칸(손잡이·고정 높이 상자)
 * 자체를 만들지 않기 때문이다(빈 상자를 남기지 않는다).
 */
export function WaitingList({ features }: { features: Feature[] }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {features.map((f) => (
        <li key={f.slug}>
          <WaitingCard feature={f} />
        </li>
      ))}
    </ul>
  );
}

/**
 * 대기 카드 하나 — 잡아서 위 칸(작업 대상)으로 올리는 손잡이다.
 *
 * 🔴 끌기 배선은 `<li>` 가 아니라 **그 안의 상자**가 받는다 — dnd-kit 의 `attributes` 에는
 * `role="button"` 이 들어 있어, `<li>` 에 그대로 얹으면 그 줄이 더 이상 목록 항목이 아니게 된다.
 *
 * `overlay` 는 손끝을 따라오는 사본이다 — 모양만 그리고 끌기 배선을 걸지 않는다(plan 탭의
 * `BoardCard` 와 같은 규율).
 */
export function WaitingCard({ feature, overlay = false }: { feature: Feature; overlay?: boolean }) {
  const description = featureDescription(feature.title, feature.slug);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: feature.slug,
    disabled: overlay,
  });

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      {...(overlay ? {} : attributes)}
      {...(overlay ? {} : listeners)}
      aria-label={`${feature.slug} — 위 칸으로 끌어 올리면 작업 대상이 됩니다`}
      className={`flex touch-none flex-col gap-y-0.5 rounded-md px-2.5 py-2 text-sm text-muted ${
        overlay
          ? "w-[min(320px,70vw)] cursor-grabbing border border-accent/40 bg-surface shadow-lg"
          : "cursor-grab hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
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
