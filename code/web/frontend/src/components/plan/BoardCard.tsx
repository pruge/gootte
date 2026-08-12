import type { PlanCard } from "@gootte/contract";

/**
 * 판 위의 카드 하나 — **기능 제목과 그 아래 티켓 줄들**(티켓 02 §만드는 것).
 *
 * 🔴 여기 보이는 것은 전부 **문서에서 온 것**이다(INV-5) — 제목도, 티켓 번호·제목·상태도.
 * 계획 DB 가 아는 것은 이 카드가 어느 칸에 있는가와 그 순서뿐이라, 둘이 갈라질 수 없다.
 *
 * 이 티켓에서는 **읽기만** 한다 — 끌어 옮기는 것은 03, 체크상자·접힘은 04, 단계는 05.
 */
export function BoardCard({ card }: { card: PlanCard }) {
  const { feature } = card;
  const headingId = `board-card-${feature.slug}`;

  return (
    <article
      aria-labelledby={headingId}
      className="shrink-0 overflow-hidden rounded-md border border-border bg-bg"
    >
      <header className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-border/70 bg-surface-2/50 px-3 py-2">
        <h3 id={headingId} className="min-w-0 truncate font-medium tracking-tight">
          {feature.title}
        </h3>
        <span className="mono text-sm text-muted">{feature.slug}</span>
        <span className="mono ml-auto shrink-0 text-sm tabular-nums text-muted">
          티켓 {feature.tickets.length}
        </span>
        {/* 닫힌 시각은 문서에 없는 값이라 계획 DB 가 갖는다(INV-5 · F6) — 있을 때만 뜬다. */}
        {card.closedAt && (
          <span className="mono shrink-0 text-sm tabular-nums text-muted">{card.closedAt}</span>
        )}
      </header>

      {feature.tickets.length === 0 ? (
        // 티켓이 없는 기능도 감추지 않는다 — 카드가 사라지면 화면이 "그런 기능이 없다" 고 거짓말한다.
        <p className="px-3 py-2 text-sm text-muted">티켓이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-border/50">
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
      )}
    </article>
  );
}
