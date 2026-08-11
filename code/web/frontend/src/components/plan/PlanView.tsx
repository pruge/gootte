import { useState } from "react";
import { IconArrowsShuffle } from "@tabler/icons-react";
import { usePlan } from "../../lib/query";
import { Loading, ErrorMsg } from "../common/states";
import { MismatchList } from "./MismatchList";
import { NextPanel } from "./NextPanel";
import { StepView } from "./StepView";
import { FeatureView } from "./FeatureView";
import { nextKeySet } from "./planGrouping";

interface PlanViewProps {
  project: string;
  /** `?view=` — "feature" 아니면 기본값 "step"(spec §자리, 새 라우팅 없음). */
  view: string | null;
  onView: (v: string | null) => void;
}

const VIEWS = [
  { id: "step", label: "단계 보기" },
  { id: "feature", label: "기능 보기" },
] as const;

/**
 * `plan` 탭(티켓 03) — 전체 개발 순서, 읽기 전용(드래그는 티켓 04). 단계 보기·기능 보기는
 * 같은 데이터의 두 표현이라 한 컴포넌트가 함께 잡는다(spec §쪼개지 않은 것도 결정이다).
 *
 * 🔴 `next` 판정을 여기서 다시 만들지 않는다 — 서버가 02 의 순수 함수(`computeNext`)로 계산해
 * 보낸 `data.next` 를 그대로 읽어 강조 집합을 고를 뿐이다(INV-1, spec §판정 자리는 하나뿐).
 * 🔴 상태(끝남·막힘·임자·착수 가능)는 캐시하지 않는다 — `usePlan` 이 매 요청 다시 읽는다(INV-3·INV-5).
 */
export function PlanView({ project, view, onView }: PlanViewProps) {
  const { data, isLoading, isError, error } = usePlan(project);
  const [nextOn, setNextOn] = useState(false);
  const activeView = view === "feature" ? "feature" : "step";

  if (isLoading) return <Loading label="개발 순서 읽는 중…" />;
  if (isError) return <ErrorMsg error={error} />;
  if (!data) return null;

  const highlighted = nextOn ? nextKeySet(data.next) : new Set<string>();

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pb-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="보기" className="flex gap-1 rounded-lg bg-surface-2 p-1">
          {VIEWS.map((v) => {
            const active = v.id === activeView;
            return (
              <button
                key={v.id}
                role="tab"
                aria-selected={active}
                onClick={() => onView(v.id)}
                className={`mono rounded-md px-3 py-1 text-sm transition-colors ${
                  active ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"
                } focus-visible:outline-2 focus-visible:outline-accent`}
              >
                {v.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          aria-pressed={nextOn}
          onClick={() => setNextOn((v) => !v)}
          className={`mono flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
            nextOn
              ? "border-accent bg-accent/15 text-accent"
              : "border-border bg-surface text-fg hover:bg-surface-2"
          }`}
        >
          <IconArrowsShuffle size={16} /> next
        </button>
      </div>

      {nextOn && <NextPanel next={data.next} />}

      <MismatchList mismatches={data.next.mismatches} />

      {activeView === "step" ? (
        <StepView features={data.features} order={data.order} highlighted={highlighted} />
      ) : (
        <FeatureView features={data.features} order={data.order} highlighted={highlighted} />
      )}
    </div>
  );
}
