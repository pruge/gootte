import { useState } from "react";
import { IconArrowMoveRight } from "@tabler/icons-react";
import type { Feature } from "@gootte/contract";
import { featureDescription } from "../plan/cardTitle";
import { dateOnly } from "../../lib/dateOnly";
import { FeatureTree, type OpenDocFn } from "./FeatureTree";
import { HighlightedText } from "./HighlightedText";
import type { BoardAreaId } from "../plan/areas";

/**
 * 남은 일 / 완료 / 착수 가능 / 처리중 세기 — 서버가 준 값을 세기만 한다(재계산 X, INV-1).
 * 🔴 `issues/`(구관례, `tickets`)와 `tickets/`(신관례, `newTickets`)를 합쳐서 센다 — 안 그러면
 * `tickets/` 만 쓰는 기능은 머리글이 전부 0을 보여주던 결함(2026-08-25 캡틴 보고) — `open > 0`
 * 게이트가 안 열려 클릭해 펼쳐야만 실제 티켓이 있다는 걸 알 수 있었다.
 */
function counts(f: Feature) {
  const all = [...f.tickets, ...(f.newTickets ?? [])];
  const done = all.filter((t) => t.status === "done").length;
  const dropped = all.filter((t) => t.status === "dropped").length;
  const working = all.filter((t) => t.status === "in_progress").length;
  const open = all.length - done - dropped;
  const startable = all.filter((t) => t.status === "pending" && t.startable).length;
  return { done, open, startable, working };
}

interface FeatureCardProps {
  feature: Feature;
  onOpenDoc: OpenDocFn;
  /**
   * 검색이 티켓 제목으로 이 카드를 걸렀을 때 참(티켓 01). 접힌 카드 안 티켓이 걸리면
   * 캡틴이 왜 걸렸는지 봐야 하므로 펼쳐서 띄운다 — 사용자가 손으로 접었던 상태는 건드리지
   * 않는다(검색어를 지우면 이 강제가 풀려 원래 펼침 상태로 돌아온다).
   */
  forceExpanded?: boolean;
  /** 검색어(비어 있으면 아무것도 안 칠한다) — 걸린 자리를 노란 칩으로 보여준다(캡틴 지시). */
  query?: string;
  /**
   * 펼침 상태를 밖에서 들고 있을 때만 준다(features 탭 — 가상 스크롤로 카드가 DOM 에서
   * 빠졌다 돌아와도 상태가 남는 자리, a-long-list-stays-usable/02 ①). 안 주면 이 카드
   * 혼자 관리한다(기존 동작 그대로, `feature-tree.test.tsx` 가 이 길을 붙든다).
   */
  expanded?: boolean;
  onToggleExpanded?: () => void;
  /** 완료 칸일 때의 완료 시각 표시("YYYY-MM-DD HH:MM") — 있으면 헤더를 간소화한다. */
  completed?: string | null;
  /** 지금 카드가 있는 칸 — 이동 아이콘의 목적지 후보에서 뺀다(plan 탭과 같은 규칙). */
  area?: BoardAreaId;
  /** 이동 아이콘 — "어느 칸으로 보낼까요" 대화상자를 여는 콜백(plan 탭 MoveDialog 재사용). */
  onRequestMove?: (slug: string) => void;
}

/**
 * 기능 카드 — 기본 접힘, 머리글을 누르면 열린다(티켓 01 §설계 2). `<button>` 이라
 * 키보드로 열고 닫을 수 있고 `aria-expanded` 로 열림/닫힘이 보조기술에 전달된다.
 *
 * 🔴 카드는 **내용만큼 자란다** — `shrink-0` 이 이 카드를 flex 부모(FeaturesView 의
 * `overflow-y-auto` 목록) 안에서 눌리지 않게 한다. 눌리는 대신 바깥 목록이 스크롤된다(F1 회귀 고정).
 *
 * 🔴 머리글은 토글 `<button>` 하나뿐이다 — 상태 배지·`plan` 버튼은 2026-08-30 에 모두 제거됐다.
 * 배지·버튼을 토글 안에 넣으면 중첩 인터랙티브라 무효 HTML 이므로, 넣지 말아야 할 근거
 * (development-order/16 ④)는 여전히 같다.
 */
export function FeatureCard({
  feature,
  onOpenDoc,
  forceExpanded = false,
  query = "",
  expanded: controlledExpanded,
  onToggleExpanded,
  completed = null,
  area,
  onRequestMove,
}: FeatureCardProps) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = controlledExpanded ?? localExpanded;
  const toggleExpanded = onToggleExpanded ?? (() => setLocalExpanded((v) => !v));
  const isExpanded = expanded || forceExpanded;
  const { done, open, startable, working } = counts(feature);
  const headingId = `feature-${feature.slug}-heading`;
  // spec 표제가 `<기능 이름> — <설명>` 꼴이면 뒤의 슬러그 배지와 이름이 겹친다 — 앞의 겹친
  // 부분만 뗀다(INV-4, `plan` 탭 카드와 같은 규칙·같은 함수). 뗄 것이 없으면 표제 그대로다.
  const title = featureDescription(feature.title, feature.slug) || feature.title;
  const hasUnread = feature.hasUnreadTicket === true;
  // 완료 칸 카드 — 헤더를 간소화한다: 이름·슬러그만 남기고 "완료 [시각]" 하나만 붙는다.
  const isDone = completed !== null;

  return (
    <section className="shrink-0 overflow-hidden rounded-lg border border-border bg-surface">
      <div
        className={`flex w-full items-stretch border-b border-border ${
          hasUnread && !isDone ? "bg-unread" : "bg-surface-2/40"
        }`}
      >
        <button
          type="button"
          aria-expanded={isExpanded}
          onClick={toggleExpanded}
          className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 text-left"
        >
          <h2 id={headingId} className="font-medium tracking-tight">
            <HighlightedText text={title} query={query} />
          </h2>
          <span className="mono text-sm text-muted">{feature.slug}</span>
          {hasUnread && !isDone && (
            // 안 읽은 티켓이 있는 동안만 뜬다 — 다 읽으면 풀린다(색 말고도 붙들 것: INV-U2).
            <span
              role="status"
              className="mono shrink-0 rounded bg-unread-strong px-1.5 py-0.5 text-sm font-medium text-unread-fg"
            >
              안 읽음
            </span>
          )}
          {isDone ? (
            // 완료 카드 — 네 수 대신 "완료 [날짜]" 하나만(캡틴 지시: 완료후 헤더는 이것만 남긴다).
            <span className="mono ml-auto text-sm tabular-nums text-muted">
              완료 {dateOnly(completed)}
            </span>
          ) : (
            /* 네 수는 항상 뜬다 — 0 이어도 칸이 사라지지 않는다(티켓 01 §설계 5 🔴). */
            <span className="mono ml-auto text-sm tabular-nums text-muted">
              남은 일 {open} · 완료 {done}
              {" · "}
              <span className={startable > 0 ? "font-medium text-accent" : undefined}>착수 가능 {startable}</span>
              {" · "}
              <span className={working > 0 ? "font-medium text-active" : undefined}>처리중 {working}</span>
            </span>
          )}
        </button>
        {onRequestMove && (
          // 🔴 다른 칸으로 보내기 — plan 탭 BoardCard 의 이동 아이콘과 같은 길이다.
          // 완료 카드에도 선다(plan 탭 done 칸과 같은 규칙, 9ae6b4d — 완료에서 꺼내는
          // 되돌리기가 정당한 이동이므로 감추지 않는다). 헤더 문구 간소화("완료 [날짜]"만)는
          // 그대로다 — 돌아온 것은 아이콘뿐이다.
          // 대화상자(MoveDialog)는 FeaturesView 가 열고, 실제 이동도 plan 과 같은
          // `movePlanCards` API(판정 자리 = 서버 planMove 하나)로 간다(INV-3).
          <div className="flex shrink-0 items-start justify-end self-center pr-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRequestMove(feature.slug);
              }}
              aria-label={`${feature.slug} 다른 칸으로 보내기`}
              title="어느 칸으로 보낼지 고른다"
              className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              <IconArrowMoveRight size={17} stroke={1.6} />
            </button>
          </div>
        )}
      </div>

      {isExpanded && (
        <div aria-labelledby={headingId}>
          <FeatureTree feature={feature} onOpenDoc={onOpenDoc} query={query} />
        </div>
      )}
    </section>
  );
}
