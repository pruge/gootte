import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { IconAlertTriangle, IconEyeOff, IconProgressAlert } from "@tabler/icons-react";
import type { InProgressSummary } from "@gootte/contract";
import { byClosedDisplayAt, closedDisplayAt } from "@gootte/core/plan";
import { useBlockedCopies, useFeatures, usePlanBoard, useSettings } from "../../lib/query";
import { ALL_AREAS, AREA_LABEL, type BoardAreaId } from "../plan/areas";
import { Loading, ErrorMsg, Empty } from "../common/states";
import { FeatureCard } from "./FeatureCard";
import { FeatureSearchBox } from "./FeatureSearchBox";
import { filterFeaturesBySearch } from "./featureSearch";
import { DocDrawer } from "./DocDrawer";
import { decodeDocView, encodeDocView } from "./docView";
import { findTrigger, type DocTrigger } from "./docTrigger";

/** 실측 전 첫 어림값 — 접힌 카드 한 장 높이에 가깝게만 잡으면 된다, 마운트되면 바로 실측으로 바뀐다. */
const ESTIMATED_ROW_HEIGHT = 64;
/** 화면 위아래로 미리 그려 두는 줄 수 — 스크롤이 빨라도 빈 자리가 먼저 보이지 않게. */
const OVERSCAN = 6;
/** 카드 사이 간격(구 `gap-4` = 1rem) — 목록이 flex 가 아니라 절대 위치라 각 줄 아래 여백으로 흉내낸다. */
const CARD_GAP_PX = 16;

/** features 탭의 영역 탭 — plan 탭과 같은 다섯 칸(작업 대상 + 대기/예약/폐기/완료)을 그대로 쓴다. */
const AREA_TABS: readonly BoardAreaId[] = ["active", "waiting", "reserved", "discarded", "done"];

const UNREADABLE_REASON: Record<InProgressSummary["unreadable"][number]["reason"], string> = {
  "no-repo": "저장소를 찾지 못함",
  "git-failed": "git 이 답하지 않음",
};

function CopyRow({
  slug,
  detail,
  title,
  onHide,
}: {
  slug: string;
  detail: string;
  title: string;
  /** 있으면 행 끝에 "숨기기" 버튼이 붙는다 — 차단 목록에 이 복사본 slug 를 넣는다. */
  onHide?: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-4 py-2">
      <span className="mono shrink-0 text-sm text-muted">{slug}</span>
      <span className="mono min-w-0 flex-1 truncate text-active" title={title}>
        {detail}
      </span>
      {onHide && (
        <button
          type="button"
          onClick={onHide}
          aria-label="이 작업 가지 숨기기"
          title="다시는 보지 않겠습니다 — 설정의 '차단한 작업 가지'에서 해제할 수 있습니다"
          className="shrink-0 rounded p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
        >
          <IconEyeOff size={16} stroke={1.75} />
        </button>
      )}
    </li>
  );
}

/**
 * 🔴 이어지지 않았거나 읽지 못한 사본 — **감추지 않는다.**
 * 조용히 빠뜨리면 화면이 "아무도 아무것도 안 하는 중" 이라고 거짓말하고, 캡틴은 이미
 * 진행 중인 일을 다시 배정한다. 어느 사본의 어느 가지인지 원문 그대로 보여준다(INV-4 릴레이).
 */
function UnresolvedWork({
  inProgress,
  onHide,
}: {
  inProgress: InProgressSummary;
  /** 숨기기 버튼을 누르면 해당 복사본 slug 로 호출된다. 없으면 버튼을 붙이지 않는다. */
  onHide?: (slug: string) => void;
}) {
  const { unknown, unreadable, unclaimed } = inProgress;
  if (unknown.length === 0 && unreadable.length === 0 && unclaimed.length === 0) return null;

  return (
    <section
      role="status"
      className="overflow-hidden rounded-lg border border-partial/40 bg-partial/10"
    >
      {unknown.length > 0 && (
        <>
          <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
            <IconProgressAlert size={17} className="shrink-0 self-center text-partial" />
            <h2 className="font-medium tracking-tight text-partial">
              티켓 미상 · 작업중 {unknown.length}
            </h2>
            <span className="text-sm text-muted">
              작업 가지에 올라가 있지만 커밋이 어느 티켓 파일도 건드리지 않아 이을 수 없었습니다.
            </span>
          </header>
          <ul className="divide-y divide-border/60 border-t border-partial/25">
            {unknown.map((w) => (
              <CopyRow
                key={w.slug}
                slug={w.slug}
                detail={w.branch}
                title={w.path}
                onHide={onHide ? () => onHide(w.slug) : undefined}
              />
            ))}
          </ul>
        </>
      )}

      {unreadable.length > 0 && (
        <>
          <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-partial/25 px-4 py-3">
            <IconAlertTriangle size={17} className="shrink-0 self-center text-partial" />
            <h2 className="font-medium tracking-tight text-partial">
              상태를 읽지 못한 사본 {unreadable.length}
            </h2>
            <span className="text-sm text-muted">
              유휴인지 작업중인지 말할 수 없습니다 — 유휴로 접지 않고 그대로 셉니다.
            </span>
          </header>
          <ul className="divide-y divide-border/60 border-t border-partial/25">
            {unreadable.map((c) => (
              <CopyRow
                key={c.slug}
                slug={c.slug}
                detail={UNREADABLE_REASON[c.reason]}
                title={c.path}
                onHide={onHide ? () => onHide(c.slug) : undefined}
              />
            ))}
          </ul>
        </>
      )}

      {unclaimed.length > 0 && (
        <>
          <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-partial/25 px-4 py-3">
            <IconAlertTriangle size={17} className="shrink-0 self-center text-partial" />
            <h2 className="font-medium tracking-tight text-partial">
              임자 없이 남은 표시 {unclaimed.length}
            </h2>
            <span className="text-sm text-muted">
              문서는 claimed 라고 말하지만 지금 붙들고 있는 사본이 없습니다 — 지우다 만 흔적일 수
              있습니다.
            </span>
          </header>
          <ul className="divide-y divide-border/60 border-t border-partial/25">
            {unclaimed.map((t) => (
              <CopyRow
                key={`${t.feature}/${t.ticket}`}
                slug={`${t.feature}/${t.ticket}`}
                detail={t.title}
                title={t.title}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

interface FeaturesViewProps {
  project: string;
  /** 드로어에 열린 문서 — URL `view` 파라미터(F8). null 이면 드로어가 닫혀 있다. */
  view: string | null;
  onView: (v: string | null) => void;
}

/** 카드 펼침 상태 — 카드 밖(여기)에 둔다, 가상 스크롤로 카드가 DOM 에서 빠졌다 돌아와도
 * 살아 있는 자리(a-long-list-stays-usable/02 ①). 여러 장을 동시에 펼쳐 둘 수 있는 지금 동작은
 * 그대로다 — 슬러그 집합일 뿐 하나로 조이지 않는다. */
function useExpandedFeatures() {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = useCallback((slug: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }, []);
  return { expanded, toggle };
}

/**
 * 기능별 할일 — `docs/features/<기능>/{spec.md,issues/,adr/,…}` 파생(INV-2 read-only).
 * 막힘 해제·착수 가능은 **서버가 매 read 재계산**한 값을 그대로 싣는다(INV-1·INV-4 — 여기서 다시 세지 않는다).
 * 처리중은 문서가 아니라 **격리 사본 관측**이 준다 — 이어지지 않은 작업도 같이 뜬다.
 *
 * 카드 목록은 이 컴포넌트가 스크롤을 갖는다(`overflow-y-auto`) — 화면에 들어온 카드만 그린다
 * (TanStack Virtual, a-long-list-stays-usable/02). 개수로 길이 갈리지 않는다(INV-V3) — 카드
 * 아홉 장이든 구백 장이든 이 한 길로 그린다. 높이는 실측해서 쓴다(③) — 짐작한 높이로 고정하면
 * 접힘·펼침·설명 유무로 제각각인 실제 높이가 들어오는 순간 보던 자리가 밀린다.
 */
export function FeaturesView({ project, view, onView }: FeaturesViewProps) {
  const { data, isError, error } = useFeatures(project);
  // 차단 목록(blockedCopies) — gootte 자기 저장소의 사용자 결정(INV-5). 화면에서 숨길 작업 가지.
  const { data: settings } = useSettings();
  const block = useBlockedCopies();
  const hideCopy = (slug: string) => {
    const current = settings?.blockedCopies ?? [];
    if (current.includes(slug)) return;
    block.mutate([...current, slug]);
  };
  const containerRef = useRef<HTMLDivElement | null>(null);
  const docView = decodeDocView(view);
  // 검색은 지금 이 순간의 일이지 저장할 상태가 아니다 — 주소에 싣지 않는다(티켓 01 §주소).
  const [query, setQuery] = useState("");
  const { expanded, toggle: toggleExpanded } = useExpandedFeatures();
  // plan 탭의 영역 분류(작업 대상/대기/예약/폐기/완료)를 그대로 가져와 기능을 같은 칸에 묶는다.
  // 🔴 화면이 자기만의 분류를 짜지 않는다 — 판정 자리는 서버(`planMove`) 하나뿐(areas.ts).
  const { data: board } = usePlanBoard(project);
  const [tab, setTab] = useState<BoardAreaId>("waiting");
  const areaBySlug = useMemo(() => {
    const m = new Map<string, BoardAreaId>();
    if (board) for (const a of ALL_AREAS) for (const c of board[a]) m.set(c.feature.slug, a);
    return m;
  }, [board]);

  // 완료 영역 카드의 완료 시각 표시 — 완료 칸일 때만 의미 있다(plan 탭과 같은 판정 자리:
  // `closedDisplayAt`, INV-4). 완료 칸에 없는 기능은 null(FeatureCard 가 원래 헤더를 그린다).
  const completedAtBySlug = useMemo(() => {
    if (!board) return null;
    const m = new Map<string, string>();
    for (const c of board.done) {
      const display = closedDisplayAt(c.closedAt, c.feature);
      if (display) m.set(c.feature.slug, display);
    }
    return m;
  }, [board]);

  // 문서를 연 자리의 신원(요소가 아니라 "무엇을 열었는지") — 드로어를 닫을 때 그 자리로
  // 스크롤한 뒤 포커스를 돌려준다(②). 카드가 스크롤을 벗어났다 돌아오면 버튼은 새 DOM
  // 노드로 다시 태어나므로, 옛 요소를 붙드는 것으로는 갈 곳을 못 찾는다.
  const lastOpenedRef = useRef<DocTrigger | null>(null);
  const [pendingFocus, setPendingFocus] = useState<DocTrigger | null>(null);

  const baseMatches = useMemo(
    () => (data ? filterFeaturesBySearch(data.features, query) : []),
    [data, query],
  );
  const tabMatches = useMemo(
    () => {
      const matches = baseMatches.filter(
        (m) => (areaBySlug.get(m.feature.slug) ?? "waiting") === tab,
      );
      // 🔴 완료 영역은 plan 탭과 같은 정렬(최근 완료가 위) — `byClosedDisplayAt` 재사용(INV-4).
      if (tab !== "done" || !board) return matches;
      const closedAtBySlug = new Map(board.done.map((c) => [c.feature.slug, c.closedAt]));
      return [...matches].sort((a, b) =>
        byClosedDisplayAt(
          { closedAt: closedAtBySlug.get(a.feature.slug) ?? null, feature: a.feature },
          { closedAt: closedAtBySlug.get(b.feature.slug) ?? null, feature: b.feature },
        ),
      );
    },
    [baseMatches, areaBySlug, tab, board],
  );
  const searching = query.trim() !== "";

  // count 는 늘 matches.length 다 — 목록이 짧을 때만 다른 길로 그리는 분기를 두지 않는다(INV-V3).
  const virtualizer = useVirtualizer({
    count: tabMatches.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: OVERSCAN,
    getItemKey: (index) => tabMatches[index]!.feature.slug,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const visibleKey = virtualItems.map((v) => v.key).join(",");

  // 스크롤이 그 자리를 다시 그릴 때까지 기다렸다가 포커스를 준다 — 스크롤 직후 한 번에
  // 못 찾으면(아직 안 그려졌으면) visibleKey 가 바뀔 때마다 다시 시도한다.
  useEffect(() => {
    if (!pendingFocus || !containerRef.current) return;
    const el = findTrigger(containerRef.current, pendingFocus);
    if (el) {
      el.focus();
      setPendingFocus(null);
    }
  }, [pendingFocus, visibleKey]);

  const openDoc = (featureSlug: string, path: string) => {
    lastOpenedRef.current = { featureSlug, path };
    onView(encodeDocView(featureSlug, path));
  };
  const closeDoc = () => {
    onView(null);
    const opened = lastOpenedRef.current;
    lastOpenedRef.current = null;
    if (!opened) return;
    const idx = tabMatches.findIndex((m) => m.feature.slug === opened.featureSlug);
    if (idx === -1) return; // 검색이 그 사이 걸러냈다 — 돌아갈 자리가 없다.
    virtualizer.scrollToIndex(idx, { align: "center" });
    setPendingFocus(opened);
  };

  // 🔴 이미 가지고 있는 내용(영속 캐시 또는 직전 fetch)은 바로 그린다 — 빈 화면/스피너 금지.
  // 데이터가 있으면 갱신 중에도 그대로 보이고, 새 값이 오면 swap 된다(T07). 에러도 데이터가
  // 있으면 화면을 지우지 않는다(낡은 화면이 거짓말일 뿐, 깨진 것보다 낫다).
  if (isError && !data) return <ErrorMsg error={error} />;
  if (!data) return <Loading label="기능 문서 읽는 중…" />;
  // 🔴 기능이 하나도 없어도 미해소 사본이 있으면 그것만은 보여준다 — 빈 화면이 거짓말하지 않게.
  const unresolved =
    data.inProgress.unknown.length +
    data.inProgress.unreadable.length +
    data.inProgress.unclaimed.length;
  if (data.features.length === 0 && unresolved === 0)
    return <Empty>docs/features/ 아래 기능이 없습니다.</Empty>;

  return (
    <>
      <div className="flex h-full flex-col">
        <div className="shrink-0 flex flex-col gap-3 px-1 pb-2">
          <FeatureSearchBox value={query} onChange={setQuery} />
          {/* plan 탭과 같은 다섯 영역(작업 대상 + 대기/예약/폐기/완료) — 정보를 그대로 쓴다. */}
          <div role="tablist" aria-label="기능 영역" className="flex flex-wrap gap-1.5">
            {AREA_TABS.map((id) => {
              const n = baseMatches.filter(
                (m) => (areaBySlug.get(m.feature.slug) ?? "waiting") === id,
              ).length;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                    tab === id
                      ? "bg-accent text-accent-fg"
                      : "bg-surface-2 text-muted hover:text-fg"
                  }`}
                >
                  {AREA_LABEL[id]}
                  <span className="mono ml-1.5 tabular-nums opacity-70">{n}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div
          ref={containerRef}
          data-virtual-viewport
          className="flex-1 overflow-y-auto pb-2"
        >
          <UnresolvedWork inProgress={data.inProgress} onHide={hideCopy} />
          {searching && tabMatches.length === 0 && (
            <p className="px-1 text-sm text-muted">찾는 것이 없습니다</p>
          )}
          {!searching && tabMatches.length === 0 && data.features.length > 0 && (
            <p className="px-1 text-sm text-muted">
              {AREA_LABEL[tab]} 영역에 기능이 없습니다.
            </p>
          )}
          {tabMatches.length > 0 && (
            // 🔴 shrink-0 없으면 flex 부모가 이 자리표시 칸을 실제 총 높이(virtualizer.getTotalSize())
            // 보다 좁게 눌러버린다 — 카드 각각에 shrink-0 을 주던 것과 같은 회귀(F1)가 여기서도
            // 일어난다. 눌리는 대신 컨테이너(overflow-y-auto)가 스크롤돼야 한다.
            <div
              className="shrink-0"
              style={{ position: "relative", height: virtualizer.getTotalSize(), width: "100%" }}
            >
              {virtualItems.map((vi) => {
                const { feature, forceExpanded } = tabMatches[vi.index]!;
                const isLast = vi.index === tabMatches.length - 1;
                return (
                  <div
                    key={vi.key}
                    data-index={vi.index}
                    data-virtual-row
                    ref={virtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${vi.start}px)`,
                      paddingBottom: isLast ? 0 : CARD_GAP_PX,
                    }}
                  >
                    <FeatureCard
                      feature={feature}
                      onOpenDoc={openDoc}
                      forceExpanded={forceExpanded}
                      query={query}
                      expanded={expanded.has(feature.slug)}
                      onToggleExpanded={() => toggleExpanded(feature.slug)}
                      completed={completedAtBySlug?.get(feature.slug) ?? null}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <DocDrawer
        project={project}
        featureSlug={docView?.featureSlug ?? null}
        path={docView?.path ?? null}
        onClose={closeDoc}
      />
    </>
  );
}
