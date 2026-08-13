import { useState } from "react";
import type { Feature } from "@gootte/contract";
import { featureDescription } from "../plan/cardTitle";
import { FeatureTree, type OpenDocFn } from "./FeatureTree";

/** 남은 일 / 완료 / 착수 가능 / 처리중 세기 — 서버가 준 값을 세기만 한다(재계산 X, INV-1). */
function counts(f: Feature) {
  const done = f.tickets.filter((t) => t.status === "done").length;
  const dropped = f.tickets.filter((t) => t.status === "dropped").length;
  const working = f.tickets.filter((t) => t.status === "in_progress").length;
  const open = f.tickets.length - done - dropped;
  const startable = f.tickets.filter((t) => t.status === "pending" && t.startable).length;
  return { done, open, startable, working };
}

interface FeatureCardProps {
  feature: Feature;
  onOpenDoc: OpenDocFn;
  /** 남은 일이 있으면 이 카드에 `plan` 버튼이 뜬다 — 누르면 `plan` 탭 기능 보기, 그 자리로
   * 돌아간다(development-order/16 ④). */
  onGoToPlan: (feature: string) => void;
}

/**
 * 기능 카드 — 기본 접힘, 머리글을 누르면 열린다(티켓 01 §설계 2). `<button>` 이라
 * 키보드로 열고 닫을 수 있고 `aria-expanded` 로 열림/닫힘이 보조기술에 전달된다.
 *
 * 🔴 카드는 **내용만큼 자란다** — `shrink-0` 이 이 카드를 flex 부모(FeaturesView 의
 * `overflow-y-auto` 목록) 안에서 눌리지 않게 한다. 눌리는 대신 바깥 목록이 스크롤된다(F1 회귀 고정).
 *
 * 🔴 머리글 토글은 여전히 `<button>` 하나다 — `plan` 버튼은 그 **옆(형제)** 에 둔다, 안이 아니다.
 * 버튼 안에 버튼을 넣는 것은 무효 HTML 이라(중첩 인터랙티브), 토글과 `plan` 을 같은 줄의
 * 형제 버튼 둘로 가른다(development-order/16 ④).
 */
export function FeatureCard({ feature, onOpenDoc, onGoToPlan }: FeatureCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { done, open, startable, working } = counts(feature);
  const headingId = `feature-${feature.slug}-heading`;
  // spec 표제가 `<기능 이름> — <설명>` 꼴이면 뒤의 슬러그 배지와 이름이 겹친다 — 앞의 겹친
  // 부분만 뗀다(INV-4, `plan` 탭 카드와 같은 규칙·같은 함수). 뗄 것이 없으면 표제 그대로다.
  const title = featureDescription(feature.title, feature.slug) || feature.title;
  const hasUnread = feature.hasUnreadTicket === true;

  return (
    <section className="shrink-0 overflow-hidden rounded-lg border border-border bg-surface">
      <div
        className={`flex w-full items-stretch border-b border-border ${
          hasUnread ? "bg-unread" : "bg-surface-2/40"
        }`}
      >
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 text-left"
        >
          <h2 id={headingId} className="font-medium tracking-tight">
            {title}
          </h2>
          <span className="mono text-sm text-muted">{feature.slug}</span>
          {hasUnread && (
            // 안 읽은 티켓이 있는 동안만 뜬다 — 다 읽으면 풀린다(색 말고도 붙들 것: INV-U2).
            <span
              role="status"
              className="mono shrink-0 rounded bg-unread-strong px-1.5 py-0.5 text-sm font-medium text-unread-fg"
            >
              안 읽음
            </span>
          )}
          {feature.sourceStatus && (
            <span
              className={`mono rounded px-1.5 py-0.5 text-sm ${
                feature.statusKnown ? "bg-surface-2 text-muted" : "bg-drop/15 text-drop"
              }`}
            >
              {feature.sourceStatus}
            </span>
          )}
          {/* 네 수는 항상 뜬다 — 0 이어도 칸이 사라지지 않는다(티켓 01 §설계 5 🔴). */}
          <span className="mono ml-auto text-sm tabular-nums text-muted">
            남은 일 {open} · 완료 {done}
            {" · "}
            <span className={startable > 0 ? "font-medium text-accent" : undefined}>착수 가능 {startable}</span>
            {" · "}
            <span className={working > 0 ? "font-medium text-active" : undefined}>처리중 {working}</span>
          </span>
        </button>
        {/* 🔴 남은 일이 없으면 뜨지 않는다 — plan 에서 볼 것이 없다(development-order/16 ④). */}
        {open > 0 && (
          <button
            type="button"
            onClick={() => onGoToPlan(feature.slug)}
            title="plan 탭에서 이 기능이 있는 자리로 이동"
            className="mono shrink-0 self-center px-3 text-sm text-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            plan
          </button>
        )}
      </div>

      {expanded && (
        <div aria-labelledby={headingId}>
          <FeatureTree feature={feature} onOpenDoc={onOpenDoc} />
        </div>
      )}
    </section>
  );
}
