import { useState } from "react";
import type { PlanCard } from "@gootte/contract";
import { featureDescription } from "./cardTitle";

/**
 * 판 위의 카드 하나 — **기본은 머리만 보이게 접혀 있고, 눌러야 티켓 줄이 펼쳐진다**(캡틴 결정).
 * 접힘은 **화면의 상태**이지 저장하지 않는다(spec §완료 카드는 접혀 있다).
 *
 * 🔴 여기 보이는 것은 전부 **문서에서 온 것**이다(INV-5) — 제목도, 티켓 번호·제목·상태도.
 * 계획 DB 가 아는 것은 이 카드가 어느 칸에 있는가와 그 순서뿐이라, 둘이 갈라질 수 없다.
 *
 * 🔴 접힌 카드도 **티켓 수는 머리에 이고 있다** — 감추면 카드가 제 크기를 말하지 않게 되고,
 * 캡틴이 판을 훑는 동안 하나하나 열어 봐야 한다.
 *
 * 머리글 토글은 `<button>` **하나**다. 03 이 카드 머리에 아이콘 둘을 붙일 때는 이 버튼 **안**이
 * 아니라 **옆(형제)** 에 둔다 — 버튼 안의 버튼은 무효 HTML 이다(features 탭 `FeatureCard` 와 같은 규율).
 *
 * 이 티켓에서는 **읽기만** 한다 — 끌어 옮기는 것은 03, 체크상자는 04, 단계는 05.
 */
export function BoardCard({ card }: { card: PlanCard }) {
  const [expanded, setExpanded] = useState(false);
  const { feature } = card;
  const headingId = `board-card-${feature.slug}`;
  // 표제 앞에 겹쳐 붙은 기능 이름은 뗀다 — 같은 이름이 한 카드에 두 번 뜨지 않게(캡틴 결정).
  const description = featureDescription(feature.title, feature.slug);

  return (
    <article
      aria-labelledby={headingId}
      className="overflow-hidden rounded-md border border-border bg-bg"
    >
      <div className="flex w-full items-stretch bg-surface-2/50">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-start gap-x-3 px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-accent"
        >
          {/* 두 줄 — 첫 줄 기능 이름, 둘째 줄 설명문구(캡틴 결정). 설명이 없는 기능(표제가 곧
              폴더명인 경우)은 이름 한 줄만 그린다 — 빈 줄로 자리를 채우지 않는다. */}
          <h3 id={headingId} className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span
              className={`mono truncate ${
                description ? "text-sm text-muted" : "font-medium tracking-tight"
              }`}
            >
              {feature.slug}
            </span>
            {description && (
              // 칸이 좁아지면 잘리므로 원문을 title 로 달아 둔다 — 잘린 것이 사라진 것이 되지 않게.
              <span className="truncate font-medium tracking-tight" title={description}>
                {description}
              </span>
            )}
          </h3>
          <span className="flex shrink-0 items-baseline gap-x-2.5">
            {/* 닫힌 시각은 문서에 없는 값이라 계획 DB 가 갖는다(INV-5 · F6) — 있을 때만 뜬다. */}
            {card.closedAt && (
              <span className="mono text-sm tabular-nums text-muted">{card.closedAt}</span>
            )}
            <span className="mono text-sm tabular-nums text-muted">
              티켓 {feature.tickets.length}
            </span>
          </span>
        </button>
      </div>

      {expanded &&
        (feature.tickets.length === 0 ? (
          // 티켓이 없는 기능도 감추지 않는다 — 열었는데 빈 칸이면 화면이 이유를 말해야 한다.
          <p className="border-t border-border/70 px-3 py-2 text-sm text-muted">
            티켓이 없습니다.
          </p>
        ) : (
          <ul className="divide-y divide-border/50 border-t border-border/70">
            {feature.tickets.map((t) => (
              <li
                key={t.slug}
                className={`flex flex-wrap items-baseline gap-x-2.5 gap-y-1 px-3 py-1.5 ${
                  t.status === "done" || t.status === "dropped" ? "text-muted" : ""
                }`}
              >
                <span className="mono shrink-0 text-sm tabular-nums text-muted">{t.num || "—"}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                {/* 원문 상태를 뭉개지 않고 그대로 릴레이한다(INV-4). 정규 값이 아니면 눈에 띄게. */}
                <span
                  className={`mono shrink-0 rounded px-1.5 py-0.5 text-sm ${
                    t.statusKnown ? "bg-surface-2 text-muted" : "bg-drop/15 text-drop"
                  }`}
                >
                  {t.sourceStatus ?? "상태 줄 없음"}
                </span>
              </li>
            ))}
          </ul>
        ))}
    </article>
  );
}
