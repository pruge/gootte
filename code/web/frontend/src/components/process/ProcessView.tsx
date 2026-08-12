import { useState } from "react";
import { groupProcessSteps, UNRANKED_STEP, type ProcessRow } from "@gootte/core/plan";
import { usePlanBoard } from "../../lib/query";
import { ticketDocPath } from "../plan/planDoc";
import { featureDescription } from "../plan/cardTitle";
import { DocDrawer } from "../features/DocDrawer";
import { Loading, ErrorMsg } from "../common/states";

interface ProcessViewProps {
  project: string;
}

/**
 * `process` 탭 — 작업 대상 티켓을 단계 순서로 줄 세운다(plan-board/07).
 *
 * 🔴 **기능으로 묶지 않는다.** 묶음은 서버가 이미 실어 보낸 표시 단계(`PlanCard.steps`,
 * plan-board/05)가 하고, 어느 기능의 몇 번 티켓인지는 줄이 말한다. 여기서는 그 값을
 * `groupProcessSteps`(core)로 다시 묶기만 한다 — 판정 자리를 늘리지 않는다.
 *
 * 🔴 **읽기 전용** — 끌어 옮기기가 없다. 티켓 줄을 누르면 `features` 탭이 이미 쓰는 `DocDrawer`
 * 를 그대로 재사용해 원문을 연다(카드 대화상자, plan-board/03 과 같은 통로).
 */
export function ProcessView({ project }: ProcessViewProps) {
  const { data, isLoading, isError, error } = usePlanBoard(project);
  const [ticketDoc, setTicketDoc] = useState<{ feature: string; path: string } | null>(null);

  if (isLoading) return <Loading label="순서를 읽는 중…" />;
  if (isError) return <ErrorMsg error={error} />;
  if (!data) return null;

  const groups = groupProcessSteps(data.active);
  // 이름 둘째 줄에 쓸 설명문구는 기능 표제에서 온다(plan 탭 BoardCard 와 같은 자리) — `steps`
  // 계산과 달리 core 의 판정이 아니라 화면 서식이라 여기서 조회한다(카드는 이미 있다, INV-1).
  const featureTitleOf = new Map(data.active.map((c) => [c.feature.slug, c.feature.title]));

  return (
    <div className="@container h-full min-h-0 overflow-y-auto">
      {groups.length === 0 ? (
        <p className="text-base text-muted">작업 대상에 올라온 것이 없다</p>
      ) : (
        // `plan` 탭 칸(`CardList`)과 같은 격자 — 칸 폭에 따라 한 줄에 최대 세 묶음까지 나란히 선다.
        <div className="grid grid-cols-1 items-start gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
          {groups.map((g) => (
            <section
              key={g.step}
              aria-labelledby={`process-step-${g.step}`}
              className="overflow-hidden rounded-lg border border-border bg-surface"
            >
              <header className="border-b border-border bg-surface-2/40 px-4 py-2">
                <h2 id={`process-step-${g.step}`} className="mono font-medium tracking-tight">
                  {g.step === UNRANKED_STEP ? "9999 — 아직 순서를 안 정했다" : `${g.step}단계`}
                </h2>
              </header>
              <ul className="divide-y divide-border/50">
                {g.rows.map((row) => (
                  <ProcessTicketLine
                    key={`${row.feature}/${row.ticket}`}
                    row={row}
                    featureTitle={featureTitleOf.get(row.feature) ?? row.feature}
                    onOpen={() => setTicketDoc({ feature: row.feature, path: ticketDocPath({ slug: row.ticket }) })}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <DocDrawer
        project={project}
        featureSlug={ticketDoc?.feature ?? null}
        path={ticketDoc?.path ?? null}
        onClose={() => setTicketDoc(null)}
      />
    </div>
  );
}

/**
 * 티켓 한 줄 — **기능 이름과 설명문구는 두 줄**, `plan` 탭 카드 머리(`BoardCard`)와 같은
 * 격자을 쓴다(캡틴 지시). 상자는 **제 칸**을 갖는다 — 이름·설명·제목과 한 줄에 섞이지 않는다.
 * 왼쪽부터 [상자 칸] [이름(1행)·설명(2행)·제목(3행) 칸] [티켓 번호 칸] 순서다.
 * 설명이 없는 기능(표제가 곧 폴더명)은 이름 한 줄만 선다.
 */
function ProcessTicketLine({
  row,
  featureTitle,
  onOpen,
}: {
  row: ProcessRow;
  featureTitle: string;
  onOpen: () => void;
}) {
  const description = featureDescription(featureTitle, row.feature);

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-2.5 gap-y-0.5 px-4 py-2 text-left hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        <span
          className={`col-start-1 row-span-3 self-center mono shrink-0 text-sm ${
            row.checked ? "text-accent" : "text-muted"
          }`}
          title={row.checked ? "문서가 완료라고 말한다" : "아직 완료가 아니다"}
        >
          {row.checked ? "[x]" : "[ ]"}
        </span>
        <span
          className={`mono col-start-2 row-start-1 min-w-0 truncate text-sm ${
            description ? "text-muted" : "font-medium tracking-tight"
          }`}
        >
          {row.feature}
        </span>
        {description && (
          <span className="col-start-2 row-start-2 break-words text-sm font-medium tracking-tight">
            {description}
          </span>
        )}
        <span className="col-start-3 row-start-1 mono shrink-0 text-sm tabular-nums text-muted">
          {row.num || "—"}
        </span>
        <span className="col-start-2 row-start-3 min-w-0 truncate text-sm text-muted">{row.title}</span>
      </button>
    </li>
  );
}
