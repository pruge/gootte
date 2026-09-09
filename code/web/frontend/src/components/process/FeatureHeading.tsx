import { IconArrowMoveRight } from "@tabler/icons-react";
import { allTickets } from "@gootte/core";
import type { Feature } from "@gootte/contract";
import { featureDescription } from "../plan/cardTitle";
import { FeatureDocsButton } from "../features/FeatureDocsButton";

/** 오른쪽 컬럼 머리 — 기능 이름 + 설명문구 두 줄(plan 탭 카드 머리와 같은 자리).
 * plan 탭 카드 머리의 곁다리 세 가지(티켓 수 · spec.md 읽기 · 이동)를 그대로 실는다(캡틴 지시):
 * 캡틴이 steps 탭에 머문 채로 "이 기능이 무슨 문서인지" 와 "이 기능을 어디로 보낼지"를 정할 수 있다. */
export function FeatureHeading({
  feature,
  onOpenDoc,
  onRequestMove,
}: {
  feature: Feature;
  onOpenDoc: (slug: string, path: string) => void;
  onRequestMove: (slug: string) => void;
}) {
  const description = featureDescription(feature.title, feature.slug);
  // 🔴 issues/(구관례)와 tickets/(신관례, T04) 를 합친다 — 안 그러면 tickets/ 만 쓰는 기능은
  // "티켓 0" 을 보여준다(`FeatureCard` 와 같은 결함, 2026-08-25).
  const ticketCount = allTickets(feature).length;
  return (
    <div className="flex flex-col gap-y-0.5 border-b border-border px-2 pb-2">
      <div className="flex flex-wrap items-center gap-x-2">
        <span
          className={`mono min-w-0 text-sm ${
            description ? "text-muted" : "font-medium tracking-tight"
          }`}
        >
          {feature.slug}
        </span>
        {feature.hasUnreadTicket === true && (
          <span
            role="status"
            className="mono shrink-0 rounded bg-unread-strong px-1.5 py-0.5 text-sm font-medium text-unread-fg"
          >
            안 읽음
          </span>
        )}
        <span className="mono shrink-0 text-sm tabular-nums text-muted">티켓 {ticketCount}</span>
        <span className="ml-auto flex shrink-0 items-center gap-0.5">
          <FeatureDocsButton feature={feature} onOpen={(path) => onOpenDoc(feature.slug, path)} />
          <button
            type="button"
            onClick={() => onRequestMove(feature.slug)}
            aria-label={`${feature.slug} 다른 칸으로 보내기`}
            title="어느 칸으로 보낼지 고른다"
            className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            <IconArrowMoveRight size={17} stroke={1.6} />
          </button>
        </span>
      </div>
      {description && (
        <span className="break-words text-sm font-medium tracking-tight">{description}</span>
      )}
    </div>
  );
}
