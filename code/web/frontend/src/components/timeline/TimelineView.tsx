import { useTimeline } from "../../lib/query";
import { Loading, ErrorMsg, Empty } from "../common/states";
import { TimelineChart } from "./TimelineChart";

/** 타임라인 뷰 — CI 워터폴 날짜축 Gantt(서버 buildGantt). 표시 전용(INV-2). */
export function TimelineView({ project }: { project: string }) {
  const { data, isLoading, isError, error } = useTimeline(project);

  if (isLoading) return <Loading label="타임라인 계산 중…" />;
  if (isError) return <ErrorMsg error={error} />;
  if (!data) return null;

  // from/to 는 날짜 있는 바·마커가 하나도 없으면 null → 그릴 축이 없음.
  if (!data.from || !data.to || data.rows.length === 0) {
    return <Empty>날짜가 있는 sprint·kickoff 이 아직 없어 타임라인을 그릴 수 없습니다.</Empty>;
  }

  return (
    <div className="flex h-full flex-col">
      <Legend />
      <div className="min-h-0 flex-1">
        <TimelineChart rows={data.rows} from={data.from} to={data.to} />
      </div>
    </div>
  );
}

/** 마커 범례 — 색·기호 의미(semantic). */
function Legend() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-4 text-sm text-muted">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-6 rounded bg-accent/75 ring-1 ring-accent/40" />
        sprint 기간
      </span>
      <span className="flex items-center gap-1.5">
        <span className="text-accent">●</span> kickoff
      </span>
      <span className="flex items-center gap-1.5">
        <span className="text-partial">▲</span> 재-kickoff
      </span>
    </div>
  );
}
