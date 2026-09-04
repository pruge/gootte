import { allTickets } from "@gootte/core";
import type { Feature } from "@gootte/contract";
import { featureDescription } from "../plan/cardTitle";

/** 남은(open) 티켓 수 — 완료·폐기 제외. 위 목록(`ProcessView`)과 같은 셈법이다(INV-1). */
function openCount(f: Feature): number {
  return allTickets(f).filter((t) => t.status !== "done" && t.status !== "dropped").length;
}

/**
 * steps 탭 왼쪽 `<aside>` **아래 칸** — 판의 **대기** 칸(`PlanBoardResponse.waiting`)을 그대로 그린다
 * (a-waiting-card-is-one-drag-away/T01).
 *
 * 🔴 **읽기만 한다.** 끌어 놓기(대기 → 작업 대상)는 T02 다 — 여기에 `useDraggable` 을 넣지 않는다.
 * 🔴 목록은 서버가 이미 계산해 보낸 것이다(INV-1) — 이 자리가 자기 목록을 따로 들지 않는다.
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
      {features.map((f) => {
        const description = featureDescription(f.title, f.slug);
        return (
          <li
            key={f.slug}
            className="flex flex-col gap-y-0.5 rounded-md px-2.5 py-2 text-sm text-muted"
          >
            <span className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate">{f.slug}</span>
              <span
                title="남은 티켓 수"
                className={`mono shrink-0 rounded-full px-1.5 text-xs font-medium tabular-nums ${
                  openCount(f) > 0 ? "bg-accent/15 text-accent" : "bg-surface-2 text-muted"
                }`}
              >
                {openCount(f)}
              </span>
              {f.hasUnreadTicket === true && (
                <span className="mono shrink-0 rounded bg-unread-strong px-1.5 py-0.5 text-sm font-medium text-unread-fg">
                  안 읽음
                </span>
              )}
            </span>
            {description && <span className="truncate text-xs text-muted/80">{description}</span>}
          </li>
        );
      })}
    </ul>
  );
}
