import type { Feature } from "@gootte/contract";
import { useFeatures } from "../../lib/query";
import { Loading, ErrorMsg, Empty } from "../common/states";
import { TicketRow } from "./TicketRow";

/** 남은 일 / 완료 세기 — 서버가 준 값을 세기만 한다(재계산 X, INV-1). */
function counts(f: Feature) {
  const done = f.tickets.filter((t) => t.status === "done").length;
  const dropped = f.tickets.filter((t) => t.status === "dropped").length;
  const open = f.tickets.length - done - dropped;
  const startable = f.tickets.filter((t) => t.status === "pending" && t.startable).length;
  return { done, open, startable };
}

function FeatureGroup({ feature }: { feature: Feature }) {
  const { done, open, startable } = counts(feature);

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
 */
export function FeaturesView({ project }: { project: string }) {
  const { data, isLoading, isError, error } = useFeatures(project);

  if (isLoading) return <Loading label="기능 문서 읽는 중…" />;
  if (isError) return <ErrorMsg error={error} />;
  if (!data) return null;
  if (data.features.length === 0) return <Empty>docs/features/ 아래 기능이 없습니다.</Empty>;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pb-2">
      {data.features.map((f) => (
        <FeatureGroup key={f.slug} feature={f} />
      ))}
    </div>
  );
}
