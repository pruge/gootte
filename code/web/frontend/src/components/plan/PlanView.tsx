import { useRef, useState } from "react";
import { IconArrowsShuffle } from "@tabler/icons-react";
import { useInsertTicketStep, useMoveFeatureRank, useMoveTicketStep, usePlan } from "../../lib/query";
import { Loading, ErrorMsg } from "../common/states";
import { MismatchList } from "./MismatchList";
import { NextPanel } from "./NextPanel";
import { StepView } from "./StepView";
import { FeatureView } from "./FeatureView";
import { DragWarningBanner } from "./DragWarningBanner";
import { nextKeySet } from "./planGrouping";
import { decodeDocView, encodeDocView } from "../features/docView";
import { DocDrawer } from "../features/DocDrawer";
import type { OpenDocFn } from "../features/FeatureTree";

interface PlanViewProps {
  project: string;
  /** `?view=` — "feature" 아니면 기본값 "step"(spec §자리, 새 라우팅 없음). */
  view: string | null;
  onView: (v: string | null) => void;
  /** 열린 티켓 문서 주소(development-order/15 ⑤) — `features` 탭의 `view` 문서 주소와 같은
   * 인코딩(`docView.ts`)을 쓰지만 `view` 는 이 탭에서 이미 단계·기능 보기 전환에 쓰이므로 자리가 다르다. */
  doc: string | null;
  onDoc: (d: string | null) => void;
}

const VIEWS = [
  { id: "step", label: "단계 보기" },
  { id: "feature", label: "기능 보기" },
] as const;

/**
 * `plan` 탭 — 전체 개발 순서, 그리고 끌어서 바꾼다(티켓 03·04). 단계 보기·기능 보기는
 * 같은 데이터의 두 표현이라 한 컴포넌트가 함께 잡는다(spec §쪼개지 않은 것도 결정이다).
 *
 * 🔴 `next` 판정을 여기서 다시 만들지 않는다 — 서버가 02 의 순수 함수(`computeNext`)로 계산해
 * 보낸 `data.next` 를 그대로 읽어 강조 집합을 고를 뿐이다(INV-1, spec §판정 자리는 하나뿐).
 * 🔴 상태(끝남·막힘·임자·착수 가능)는 캐시하지 않는다 — `usePlan` 이 매 요청 다시 읽는다(INV-3·INV-5).
 * 🔴 드래그의 네 검사는 서버(`checkTicketDragWarnings`)가 계산해 보낸다 — 여기서 다시 판정하지 않는다.
 *
 * 🔴 판단 요청("의견 물어보기", 티켓 06)은 09 가 걷어냈다 — 캡틴이 상자를 발견해 누르고 기다리는
 * 통로보다, 이미 있는 대화창이 더 낫다는 결정이다(spec §의견 요청은 걷어냈다). 되살리지 않는다.
 */
export function PlanView({ project, view, onView, doc, onDoc }: PlanViewProps) {
  const { data, isLoading, isError, error } = usePlan(project);
  const [nextOn, setNextOn] = useState(false);
  // 티켓 09 ② — 방금 끈 티켓 하나에 대한 말이다(계획 전체의 어긋남과는 다른 자리). 배치가 바뀌면
  // 다시 물어서 갱신하므로(`data.dragWarnings`), 여기서는 "누구를 봤는지"·"닫았는지"만 들고 있는다.
  const [dragSubject, setDragSubject] = useState<{ feature: string; ticket: string } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const activeView = view === "feature" ? "feature" : "step";

  const moveTicketStep = useMoveTicketStep(project);
  const insertTicketStep = useInsertTicketStep(project);
  const moveFeatureRank = useMoveFeatureRank(project);

  // development-order/15 ⑤ — 티켓 칩을 눌러 그 문서를 연다. `features` 탭(`FeaturesView`)과
  // 같은 서랍(`DocDrawer`)·같은 인코딩(`docView.ts`)을 그대로 부른다 — 두 번째 문서 보기를 짓지 않는다.
  const triggerRef = useRef<HTMLElement | null>(null);
  const docView = decodeDocView(doc);
  const openDoc: OpenDocFn = (featureSlug, path, trigger) => {
    triggerRef.current = trigger;
    onDoc(encodeDocView(featureSlug, path));
  };
  const closeDoc = () => {
    onDoc(null);
    triggerRef.current?.focus();
    triggerRef.current = null;
  };

  if (isLoading) return <Loading label="개발 순서 읽는 중…" />;
  if (isError) return <ErrorMsg error={error} />;
  if (!data) return null;

  const highlighted = nextOn ? nextKeySet(data.next) : new Set<string>();
  const dragWarnings =
    dragSubject && !dismissed ? (data.dragWarnings[`${dragSubject.feature}/${dragSubject.ticket}`] ?? []) : [];

  function onTicketDropped(feature: string, ticket: string) {
    setDragSubject({ feature, ticket });
    setDismissed(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* 조작 줄 — 스크롤 대상이 아니다(티켓 09 ④). 계획만 아래에서 스크롤한다. */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
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
        <div className="flex items-center gap-3">
          {/* 되돌리기 없음(spec 04 §history.md) — 실수로 끌었을 때 무엇을 해야 하는지 조용히 알린다. */}
          <span className="mono text-xs text-muted" title="DB 는 최신 계획만 갖는다. history.md 로 지나온 자취만 짚어볼 수 있다.">
            되돌리기 없음
          </span>
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
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-2">
        {nextOn && <NextPanel next={data.next} />}

        <DragWarningBanner warnings={dragWarnings} onDismiss={() => setDismissed(true)} />

        <MismatchList mismatches={data.next.mismatches} />

        {activeView === "step" ? (
          <StepView
            features={data.features}
            order={data.order}
            highlighted={highlighted}
            onMoveToStep={(feature, ticket, step) =>
              moveTicketStep.mutate(
                { feature, ticket, step },
                { onSuccess: () => onTicketDropped(feature, ticket) },
              )
            }
            onInsertAfterStep={(feature, ticket, afterStep) =>
              insertTicketStep.mutate(
                { feature, ticket, afterStep },
                { onSuccess: () => onTicketDropped(feature, ticket) },
              )
            }
            onMoveFeatureTrack={(feature, track) =>
              moveFeatureRank.mutate({ feature, track, beforeRank: null, afterRank: null })
            }
            onOpenDoc={openDoc}
          />
        ) : (
          <FeatureView
            features={data.features}
            order={data.order}
            highlighted={highlighted}
            onMoveFeature={(feature, track, beforeRank, afterRank) =>
              moveFeatureRank.mutate({ feature, track, beforeRank, afterRank })
            }
            onOpenDoc={openDoc}
          />
        )}
      </div>

      <DocDrawer
        project={project}
        featureSlug={docView?.featureSlug ?? null}
        path={docView?.path ?? null}
        onClose={closeDoc}
      />
    </div>
  );
}
