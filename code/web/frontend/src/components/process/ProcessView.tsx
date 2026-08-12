import { useState } from "react";
import { groupProcessSteps, UNRANKED_STEP, type ProcessRow } from "@gootte/core/plan";
import { usePlanBoard } from "../../lib/query";
import { ticketDocPath } from "../plan/planDoc";
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

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto">
      {groups.length === 0 ? (
        <p className="text-base text-muted">작업 대상에 올라온 것이 없다</p>
      ) : (
        groups.map((g) => (
          <section
            key={g.step}
            aria-labelledby={`process-step-${g.step}`}
            className="shrink-0 overflow-hidden rounded-lg border border-border bg-surface"
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
                  onOpen={() => setTicketDoc({ feature: row.feature, path: ticketDocPath({ slug: row.ticket }) })}
                />
              ))}
            </ul>
          </section>
        ))
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

function ProcessTicketLine({ row, onOpen }: { row: ProcessRow; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-wrap items-baseline gap-x-2.5 gap-y-1 px-4 py-2 text-left hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        <span
          className={`mono shrink-0 text-sm ${row.checked ? "text-accent" : "text-muted"}`}
          title={row.checked ? "문서가 완료라고 말한다" : "아직 완료가 아니다"}
        >
          {row.checked ? "[x]" : "[ ]"}
        </span>
        <span className="mono shrink-0 text-sm text-muted">
          {row.feature} / {row.num || "—"}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">{row.title}</span>
      </button>
    </li>
  );
}
