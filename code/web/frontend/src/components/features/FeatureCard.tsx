import { useState } from "react";
import type { Feature } from "@gootte/contract";
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
}

/**
 * 기능 카드 — 기본 접힘, 머리글을 누르면 열린다(티켓 01 §설계 2). `<button>` 이라
 * 키보드로 열고 닫을 수 있고 `aria-expanded` 로 열림/닫힘이 보조기술에 전달된다.
 *
 * 🔴 카드는 **내용만큼 자란다** — `shrink-0` 이 이 카드를 flex 부모(FeaturesView 의
 * `overflow-y-auto` 목록) 안에서 눌리지 않게 한다. 눌리는 대신 바깥 목록이 스크롤된다(F1 회귀 고정).
 */
export function FeatureCard({ feature, onOpenDoc }: FeatureCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { done, open, startable, working } = counts(feature);
  const headingId = `feature-${feature.slug}-heading`;

  return (
    <section className="shrink-0 overflow-hidden rounded-lg border border-border bg-surface">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border bg-surface-2/40 px-4 py-3 text-left"
      >
        <h2 id={headingId} className="font-medium tracking-tight">
          {feature.title}
        </h2>
        <span className="mono text-sm text-muted">{feature.slug}</span>
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

      {expanded && (
        <div aria-labelledby={headingId}>
          <FeatureTree feature={feature} onOpenDoc={onOpenDoc} />
        </div>
      )}
    </section>
  );
}
