import { IconLoader2, IconTelescope } from "@tabler/icons-react";
import type { Tab } from "../../hooks/useUrlState";
import { usePlan, useLineage } from "../../lib/query";
import { Tabs } from "./Tabs";

interface MainPanelProps {
  project: string | null;
  tab: Tab;
  onTab: (t: Tab) => void;
}

/** 셸의 메인 영역 — 헤더(프로젝트+탭) + 본문. plan/lineage 뷰 본체는 010(T4·T5)이 채운다. */
export function MainPanel({ project, tab, onTab }: MainPanelProps) {
  if (!project) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center gap-3 text-muted">
        <IconTelescope size={40} stroke={1.25} />
        <p className="text-sm">왼쪽에서 프로젝트를 선택하세요.</p>
      </section>
    );
  }

  return (
    <section className="flex flex-1 flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <h1 className="text-hero font-semibold tracking-tight">{project}</h1>
        <Tabs tab={tab} onTab={onTab} />
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {tab === "plan" ? <PlanPlaceholder project={project} /> : <LineagePlaceholder project={project} />}
      </div>
    </section>
  );
}

// ── 010 전 임시 요약(쿼리 배선 증명). T4/T5 가 실제 뷰로 교체 ──
function PlanPlaceholder({ project }: { project: string }) {
  const { data, isLoading, isError, error } = usePlan(project);
  if (isLoading) return <Loading />;
  if (isError) return <Err error={error} />;
  return (
    <Stub>
      plan <b className="text-fg">{data?.plan.length ?? 0}</b>개 · rationale{" "}
      <b className="text-fg">{data?.rationale.length ?? 0}</b> — 순서+왜 뷰는 <span className="mono">010(T4)</span>
    </Stub>
  );
}

function LineagePlaceholder({ project }: { project: string }) {
  const { data, isLoading, isError, error } = useLineage(project);
  if (isLoading) return <Loading />;
  if (isError) return <Err error={error} />;
  return (
    <Stub>
      supersede edges <b className="text-fg">{data?.edges.length ?? 0}</b> · drops{" "}
      <b className="text-fg">{data?.drops.length ?? 0}</b> — 체인 뷰는 <span className="mono">010(T5)</span>
    </Stub>
  );
}

const Loading = () => (
  <p className="flex items-center gap-2 text-sm text-muted">
    <IconLoader2 size={16} className="animate-spin" /> 로드 중…
  </p>
);
const Err = ({ error }: { error: unknown }) => (
  <p role="alert" className="text-sm text-drop">
    {error instanceof Error ? error.message : "로드 실패"}
  </p>
);
const Stub = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-3 text-sm text-muted">
    {children}
  </p>
);
