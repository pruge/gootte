import { useRef } from "react";
import { IconAlertTriangle, IconProgressAlert } from "@tabler/icons-react";
import type { InProgressSummary } from "@gootte/contract";
import { useFeatures } from "../../lib/query";
import { Loading, ErrorMsg, Empty } from "../common/states";
import { FeatureCard } from "./FeatureCard";
import { DocDrawer } from "./DocDrawer";
import { decodeDocView, encodeDocView } from "./docView";

const UNREADABLE_REASON: Record<InProgressSummary["unreadable"][number]["reason"], string> = {
  "no-repo": "저장소를 찾지 못함",
  "git-failed": "git 이 답하지 않음",
};

function CopyRow({ slug, detail, title }: { slug: string; detail: string; title: string }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 px-4 py-2">
      <span className="mono shrink-0 text-sm text-muted">{slug}</span>
      <span className="mono min-w-0 flex-1 truncate text-active" title={title}>
        {detail}
      </span>
    </li>
  );
}

/**
 * 🔴 이어지지 않았거나 읽지 못한 사본 — **감추지 않는다.**
 * 조용히 빠뜨리면 화면이 "아무도 아무것도 안 하는 중" 이라고 거짓말하고, 캡틴은 이미
 * 진행 중인 일을 다시 배정한다. 어느 사본의 어느 가지인지 원문 그대로 보여준다(INV-4 릴레이).
 */
function UnresolvedWork({ inProgress }: { inProgress: InProgressSummary }) {
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
              <CopyRow key={w.slug} slug={w.slug} detail={w.branch} title={w.path} />
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
  /** 카드의 `plan` 버튼 — `plan` 탭 기능 보기, 그 자리로 건너간다(development-order/16 ④). */
  onGoToPlanFeature: (feature: string) => void;
}

/**
 * 기능별 할일 — `docs/features/<기능>/{spec.md,issues/,adr/,…}` 파생(INV-2 read-only).
 * 막힘 해제·착수 가능은 **서버가 매 read 재계산**한 값을 그대로 싣는다(INV-1·INV-4 — 여기서 다시 세지 않는다).
 * 처리중은 문서가 아니라 **격리 사본 관측**이 준다 — 이어지지 않은 작업도 같이 뜬다.
 *
 * 카드 목록은 이 컴포넌트가 스크롤을 갖는다(`overflow-y-auto`) — 각 카드는 `shrink-0` 이라
 * 내용만큼 자라고 눌리지 않는다(F1 회귀 고정, 티켓 01 §설계 1).
 */
export function FeaturesView({ project, view, onView, onGoToPlanFeature }: FeaturesViewProps) {
  const { data, isLoading, isError, error } = useFeatures(project);
  // 문서를 연 트리거 요소 — 드로어를 닫을 때 포커스를 여기로 돌려준다(티켓 01 §설계 4).
  const triggerRef = useRef<HTMLElement | null>(null);
  const docView = decodeDocView(view);

  const openDoc = (featureSlug: string, path: string, trigger: HTMLElement) => {
    triggerRef.current = trigger;
    onView(encodeDocView(featureSlug, path));
  };
  const closeDoc = () => {
    onView(null);
    triggerRef.current?.focus();
    triggerRef.current = null;
  };

  if (isLoading) return <Loading label="기능 문서 읽는 중…" />;
  if (isError) return <ErrorMsg error={error} />;
  if (!data) return null;
  // 🔴 기능이 하나도 없어도 미해소 사본이 있으면 그것만은 보여준다 — 빈 화면이 거짓말하지 않게.
  const unresolved =
    data.inProgress.unknown.length +
    data.inProgress.unreadable.length +
    data.inProgress.unclaimed.length;
  if (data.features.length === 0 && unresolved === 0)
    return <Empty>docs/features/ 아래 기능이 없습니다.</Empty>;

  return (
    <>
      <div className="flex h-full flex-col gap-4 overflow-y-auto pb-2">
        <UnresolvedWork inProgress={data.inProgress} />
        {data.features.map((f) => (
          <FeatureCard key={f.slug} feature={f} onOpenDoc={openDoc} onGoToPlan={onGoToPlanFeature} />
        ))}
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
