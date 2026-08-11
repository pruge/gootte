import { IconTelescope } from "@tabler/icons-react";
import type { Tab } from "../../hooks/useUrlState";
import { FeaturesView } from "../features/FeaturesView";
import { PlanView } from "../plan/PlanView";
import { Tabs } from "./Tabs";

interface MainPanelProps {
  project: string | null;
  tab: Tab;
  onTab: (t: Tab) => void;
  view: string | null;
  onView: (v: string | null) => void;
  /** `plan` 탭에서 연 티켓 문서 주소(development-order/15 ⑤) — `features` 탭은 안 쓴다. */
  doc: string | null;
  onDoc: (d: string | null) => void;
  /** 다른 탭에서 건너와 포커스할 기능(development-order/16 ③④) — 탭마다 뜻이 다르다. */
  focus: string | null;
  /** `plan` 탭 기능 카드를 누르면 `features` 탭 그 카드로 건너간다. */
  onGoToFeatureCard: (feature: string) => void;
  /** `features` 탭의 `plan` 버튼으로 `plan` 탭 기능 보기, 그 자리로 돌아간다. */
  onGoToPlanFeature: (feature: string) => void;
}

/** 셸의 메인 영역 — 본문 header(브랜드 + 프로젝트 + 탭) + 뷰. */
export function MainPanel({
  project,
  tab,
  onTab,
  view,
  onView,
  doc,
  onDoc,
  focus,
  onGoToFeatureCard,
  onGoToPlanFeature,
}: MainPanelProps) {
  return (
    <section className="flex flex-1 flex-col overflow-hidden">
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border pl-4 pr-6">
        {project ? (
          <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">{project}</h1>
        ) : (
          <span />
        )}
        {project && (
          <div className="flex shrink-0 items-center gap-3">
            <Tabs tab={tab} onTab={onTab} />
          </div>
        )}
      </header>

      {!project ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted">
          <IconTelescope size={40} stroke={1.25} />
          <p className="text-sm">왼쪽에서 프로젝트를 선택하세요.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden pl-4 pr-6 py-5">
          {tab === "plan" ? (
            <PlanView
              key={`${project}-plan`}
              project={project}
              view={view}
              onView={onView}
              doc={doc}
              onDoc={onDoc}
              focus={focus}
              onGoToFeatureCard={onGoToFeatureCard}
            />
          ) : (
            <FeaturesView
              key={`${project}-features`}
              project={project}
              view={view}
              onView={onView}
              focus={focus}
              onGoToPlanFeature={onGoToPlanFeature}
            />
          )}
        </div>
      )}
    </section>
  );
}
