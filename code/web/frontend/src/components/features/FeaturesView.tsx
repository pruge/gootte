import { IconProgressAlert } from "@tabler/icons-react";
import type { Feature, InProgressSummary } from "@gootte/contract";
import { useFeatures } from "../../lib/query";
import { Loading, ErrorMsg, Empty } from "../common/states";
import { TicketRow } from "./TicketRow";

/** 남은 일 / 완료 / 처리중 세기 — 서버가 준 값을 세기만 한다(재계산 X, INV-1). */
function counts(f: Feature) {
  const done = f.tickets.filter((t) => t.status === "done").length;
  const dropped = f.tickets.filter((t) => t.status === "dropped").length;
  const working = f.tickets.filter((t) => t.status === "in_progress").length;
  const open = f.tickets.length - done - dropped;
  const startable = f.tickets.filter((t) => t.status === "pending" && t.startable).length;
  return { done, open, startable, working };
}

/**
 * 🔴 티켓에 잇지 못한 작업중 사본 — **감추지 않는다.**
 * 조용히 빠뜨리면 화면이 "아무도 아무것도 안 하는 중" 이라고 거짓말하고, 캡틴은 이미
 * 진행 중인 일을 다시 배정한다. 어느 사본의 어느 가지인지 원문 그대로 보여준다(INV-4 릴레이).
 */
function UnknownWork({ inProgress }: { inProgress: InProgressSummary }) {
  if (inProgress.unknown.length === 0) return null;

  return (
    <section
      role="status"
      className="overflow-hidden rounded-lg border border-partial/40 bg-partial/10"
    >
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
        <IconProgressAlert size={17} className="shrink-0 self-center text-partial" />
        <h2 className="font-medium tracking-tight text-partial">
          티켓 미상 · 작업중 {inProgress.unknown.length}
        </h2>
        <span className="text-sm text-muted">
          작업 가지에 올라가 있지만 커밋이 어느 티켓 파일도 건드리지 않아 이을 수 없었습니다.
        </span>
      </header>
      <ul className="divide-y divide-border/60 border-t border-partial/25">
        {inProgress.unknown.map((w) => (
          <li key={w.slug} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 px-4 py-2">
            <span className="mono shrink-0 text-sm text-muted">{w.slug}</span>
            <span className="mono min-w-0 flex-1 truncate text-active" title={w.path}>
              {w.branch}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FeatureGroup({ feature }: { feature: Feature }) {
  const { done, open, startable, working } = counts(feature);

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border bg-surface-2/40 px-4 py-3">
        <h2 className="font-medium tracking-tight">{feature.title}</h2>
        <span className="mono text-sm text-muted">{feature.slug}</span>
        {feature.sourceStatus && (
          <span
            className={`mono rounded px-1.5 py-0.5 text-sm ${
              feature.statusKnown ? "bg-surface-2 text-muted" : "bg-drop/15 text-drop"
            }`}
          >
            {feature.sourceStatus}
          </span>
        )}
        <span className="mono ml-auto text-sm tabular-nums text-muted">
          남은 일 {open} · 완료 {done}
          {working > 0 && (
            <>
              {" · "}
              <span className="font-medium text-active">처리중 {working}</span>
            </>
          )}
          {startable > 0 && (
            <>
              {" · "}
              <span className="font-medium text-accent">착수 가능 {startable}</span>
            </>
          )}
        </span>
      </header>

      {feature.tickets.length === 0 ? (
        <p className="px-4 py-3 text-base text-muted">티켓이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-border">
          {feature.tickets.map((t) => (
            <TicketRow key={t.slug} ticket={t} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * 기능별 할일 — `docs/features/<기능>/{spec.md,issues/}` 파생(INV-2 read-only).
 * 막힘 해제·착수 가능은 **서버가 매 read 재계산**한 값을 그대로 싣는다(INV-1·INV-4 — 여기서 다시 세지 않는다).
 * 처리중은 문서가 아니라 **격리 사본 관측**이 준다 — 이어지지 않은 작업도 같이 뜬다.
 */
export function FeaturesView({ project }: { project: string }) {
  const { data, isLoading, isError, error } = useFeatures(project);

  if (isLoading) return <Loading label="기능 문서 읽는 중…" />;
  if (isError) return <ErrorMsg error={error} />;
  if (!data) return null;
  // 🔴 기능이 하나도 없어도 진행 중인 작업이 있으면 그것만은 보여준다 — 빈 화면이 거짓말하지 않게.
  if (data.features.length === 0 && data.inProgress.unknown.length === 0)
    return <Empty>docs/features/ 아래 기능이 없습니다.</Empty>;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pb-2">
      <UnknownWork inProgress={data.inProgress} />
      {data.features.map((f) => (
        <FeatureGroup key={f.slug} feature={f} />
      ))}
    </div>
  );
}
