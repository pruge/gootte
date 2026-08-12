import { useState } from "react";
import { IconInbox } from "@tabler/icons-react";
import type { PlanBoardResponse, PlanCard } from "@gootte/contract";
import { usePlanBoard } from "../../lib/query";
import { Loading, ErrorMsg } from "../common/states";
import { BoardCard } from "./BoardCard";

/**
 * 아래 칸의 네 탭 — 캡틴 그림의 순서 그대로(대기 · 예약 · 폐기 · 완료).
 * 🔴 `id` 는 응답의 칸 이름과 **같은 문자열**이다. 화면이 자기만의 이름을 따로 두면 그 사전이
 * 서버와 갈라진다(spec §판정 자리는 하나뿐).
 */
const TABS = [
  { id: "waiting", label: "대기", empty: "docs/features/ 아래 기능이 없습니다." },
  { id: "reserved", label: "예약", empty: "내려 둔 기능이 없습니다." },
  { id: "discarded", label: "폐기", empty: "폐기한 기능이 없습니다." },
  { id: "done", label: "완료", empty: "완료된 기능이 없습니다." },
] as const;

type TabId = (typeof TABS)[number]["id"];

function CardList({ cards, empty }: { cards: PlanCard[]; empty: string }) {
  if (cards.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted">
        <IconInbox size={26} stroke={1.25} />
        <p className="text-sm">{empty}</p>
      </div>
    );
  }
  return (
    // 🔴 칸 수는 **화면 폭이 아니라 이 칸의 폭**이 정한다(`@container`) — 판은 사이드바 옆에 있어
    // 창 크기와 칸 폭이 같지 않다. 뷰포트로 재면 사이드바를 접었을 때 칸이 넓어져도 그대로 있다.
    // 접힌 카드는 높이가 같아 줄이 가지런하고, 하나를 펼쳐도 `items-start` 라 옆 카드가 늘어나지 않는다.
    <div className="@container h-full overflow-y-auto p-3">
      <div className="grid grid-cols-1 items-start gap-2.5 @2xl:grid-cols-2 @5xl:grid-cols-3">
        {cards.map((c) => (
          <BoardCard key={c.feature.slug} card={c} />
        ))}
      </div>
    </div>
  );
}

/** 칸 하나의 카드 수 — 화면이 세는 것이 아니라 서버가 갈라 준 목록의 길이다(INV-1). */
function Count({ n }: { n: number }) {
  return <span className="mono shrink-0 text-sm tabular-nums text-muted">{n}</span>;
}

/**
 * `plan` 탭 — 다섯 자리 판(plan-board/02). 캡틴 그림 그대로 위에 **작업 대상** 하나,
 * 아래에 **대기 · 예약 · 폐기 · 완료** 네 탭을 가진 칸 하나.
 *
 * 🔴 다섯 칸은 **서버가 이미 갈라 보낸 것**을 그대로 그린다 — 화면은 자리를 판정하지 않는다.
 * 문서를 새로 쓰면 자리 행이 없는 채로 대기 칸에 뜨고(INV-B1), 그 갱신은 이미 있는 실시간
 * 배선(WS `/api/live` → `plan` 쿼리 invalidate, spec F1·F3)을 타므로 새 감시를 만들지 않는다.
 *
 * 이 티켓에서는 **읽기만** 한다 — 끌어 옮기는 것은 03, 체크상자·접힘은 04, 단계는 05.
 */
export function PlanView({ project }: { project: string }) {
  const { data, isLoading, isError, error } = usePlanBoard(project);
  const [tab, setTab] = useState<TabId>("waiting");

  if (isLoading) return <Loading label="판을 그리는 중…" />;
  if (isError) return <ErrorMsg error={error} />;
  if (!data) return null;

  const board: PlanBoardResponse = data;
  const current = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* ── 위: 작업 대상 — 지금 붙들고 갈 것. accent 가 이 칸 하나에만 붙는다 ── */}
      <section
        aria-labelledby="board-active-heading"
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-accent/35 bg-surface"
      >
        <header className="flex shrink-0 items-baseline gap-2.5 border-b border-accent/25 bg-accent/8 px-4 py-2.5">
          <h2 id="board-active-heading" className="font-medium tracking-tight text-accent">
            작업 대상
          </h2>
          <Count n={board.active.length} />
        </header>
        <CardList cards={board.active} empty="작업 대상이 비어 있습니다." />
      </section>

      {/* ── 아래: 네 탭 한 칸 ── */}
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface">
        <div
          role="tablist"
          aria-label="자리"
          className="flex shrink-0 gap-1 border-b border-border bg-surface-2/40 px-2 py-1.5"
        >
          {TABS.map((t) => {
            const selected = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(t.id)}
                className={`mono flex items-baseline gap-1.5 rounded-md px-3 py-1 text-sm transition-colors ${
                  selected ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"
                } focus-visible:outline-2 focus-visible:outline-accent`}
              >
                {t.label}
                <Count n={board[t.id].length} />
              </button>
            );
          })}
        </div>
        <div role="tabpanel" aria-label={current.label} className="min-h-0 flex-1">
          <CardList cards={board[current.id]} empty={current.empty} />
        </div>
      </section>
    </div>
  );
}
