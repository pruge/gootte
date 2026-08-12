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
 * 🔴 **단계 판정 자리는 그대로 하나다.** `groupProcessSteps`(core)가 서버가 이미 실어 보낸
 * 표시 단계(`PlanCard.steps`, plan-board/05)를 모아 줄 뿐이고, 여기서 다시 계산하지 않는다.
 * **기능별로 묶어 보여주는 것은 그 위의 화면 서식**이다(캡틴 지시 2026-08-12: "feature 단위로
 * 그룹을 만들어 표시하자, 이름을 회색 헤더로 두고 그 밑에 ticket을 두자") — 같은 단계 안에서는
 * 순서에 의미가 없어(spec §next, `step` 테이블에 우선순위 칸이 없다) 어차피 하나로 늘어놓으나
 * 기능별로 나누나 판정은 같다. 이미 `groupProcessSteps`가 기능 순으로 정렬해 주므로 여기서는
 * 그 정렬을 깨지 않고 이웃한 같은 기능 줄만 한 다발로 묶는다.
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
              {/* 기능 다발 사이는 선이 아니라 빈틈으로 나눈다(캡틴 지시) — 한 단계 안에서도 어느
                  다발이 끝나고 다음 다발이 시작되는지 눈에 바로 잡히게. */}
              <div className="flex flex-col gap-3 py-2">
                {clusterByFeature(g.rows).map((cluster) => (
                  <div key={cluster.feature}>
                    <FeatureHeader
                      feature={cluster.feature}
                      title={featureTitleOf.get(cluster.feature) ?? cluster.feature}
                    />
                    <ul className="divide-y divide-border/30">
                      {cluster.rows.map((row) => (
                        <ProcessTicketLine
                          key={`${row.feature}/${row.ticket}`}
                          row={row}
                          onOpen={() =>
                            setTicketDoc({ feature: row.feature, path: ticketDocPath({ slug: row.ticket }) })
                          }
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
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
 * 같은 단계 안의 줄을 기능별 다발로 나눈다 — **판정이 아니라 표시 재배열**이다. 같은 단계 안
 * 순서는 의미가 없으므로(`step` 테이블에 우선순위 칸이 없다) `groupProcessSteps`가 이미 준
 * 기능순 정렬을 그대로 따라 이웃한 같은 기능 줄만 묶는다 — 순서를 다시 매기지 않는다.
 */
function clusterByFeature(rows: readonly ProcessRow[]): { feature: string; rows: ProcessRow[] }[] {
  const clusters: { feature: string; rows: ProcessRow[] }[] = [];
  for (const row of rows) {
    const last = clusters[clusters.length - 1];
    if (last && last.feature === row.feature) last.rows.push(row);
    else clusters.push({ feature: row.feature, rows: [row] });
  }
  return clusters;
}

/**
 * 기능 다발의 머리 — **회색 헤더**(캡틴 지시)에 이름과 설명문구를 두 줄로 싣는다. `plan` 탭
 * 카드 머리(`BoardCard`)와 같은 자리다. 설명이 없는 기능(표제가 곧 폴더명)은 이름 한 줄만 선다.
 */
function FeatureHeader({ feature, title }: { feature: string; title: string }) {
  const description = featureDescription(title, feature);
  return (
    <div className="flex flex-col gap-y-0.5 bg-surface-2/60 px-4 py-1.5">
      <span
        className={`mono text-sm ${description ? "text-muted" : "font-medium tracking-tight"}`}
      >
        {feature}
      </span>
      {description && (
        <span className="break-words text-sm font-medium tracking-tight">{description}</span>
      )}
    </div>
  );
}

/** 티켓 한 줄 — 상자는 **제 칸**을 갖는다(캡틴 지시). 기능 이름은 다발 머리가 이미 말하므로 여기서는 상자·번호·제목만 선다. */
function ProcessTicketLine({ row, onOpen }: { row: ProcessRow; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="grid w-full grid-cols-[auto_auto_minmax(0,1fr)] items-baseline gap-x-2.5 px-4 py-2 text-left hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        <span
          className={`col-start-1 mono shrink-0 text-sm ${row.checked ? "text-accent" : "text-muted"}`}
          title={row.checked ? "문서가 완료라고 말한다" : "아직 완료가 아니다"}
        >
          {row.checked ? "[x]" : "[ ]"}
        </span>
        <span className="col-start-2 mono shrink-0 text-sm tabular-nums text-muted">
          {row.num || "—"}
        </span>
        <span className="col-start-3 min-w-0 truncate text-sm">{row.title}</span>
      </button>
    </li>
  );
}
