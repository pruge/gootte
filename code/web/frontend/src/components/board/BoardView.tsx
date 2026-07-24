import type { KanbanColumn } from "@gootte/contract";
import { useBoard } from "../../lib/query";
import { Loading, ErrorMsg } from "../common/states";
import { BoardCard } from "./BoardCard";

// 컬럼 표시 라벨(frontend 소유) — 카드 status chip("active" 등 ledger 상태)과 단어 충돌 회피.
// 버킷 의미: 진행 중=활성 worktree · 준비됨=의존 충족 착수가능 · 막힘=선행 미충족.
const COL: Record<KanbanColumn["key"], { label: string; hint: string }> = {
  active: { label: "진행 중", hint: "활성 worktree (지금 작업 중)" },
  ready: { label: "착수 가능", hint: "선행 의존 충족 · 지금 시작 가능" },
  blocked: { label: "선행 대기", hint: "선행 의존 미완 — 끝나야 착수 가능" },
};

/** 칸반 보드 — 3 파티션 컬럼(서버 buildKanban). 표시 전용(INV-2, 드래그 X). */
export function BoardView({ project }: { project: string }) {
  const { data, isLoading, isError, error } = useBoard(project);

  if (isLoading) return <Loading label="보드 계산 중…" />;
  if (isError) return <ErrorMsg error={error} />;
  if (!data) return null;

  return (
    <div className="flex h-full gap-4">
      {data.columns.map((col) => (
        <BoardColumn key={col.key} column={col} />
      ))}
    </div>
  );
}

function BoardColumn({ column }: { column: KanbanColumn }) {
  const blocked = column.key === "blocked";
  const meta = COL[column.key];
  return (
    <section aria-label={meta.label} className="flex min-w-0 flex-1 flex-col">
      <header
        title={meta.hint}
        className="mono flex items-center gap-2 px-1 pb-2 text-sm tracking-[0.1em] text-muted"
      >
        {meta.label}
        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-fg">{column.items.length}</span>
      </header>
      <div className="flex flex-col gap-2 overflow-y-auto pr-1">
        {column.items.map((item) => (
          <BoardCard key={item.initiative} item={item} blocked={blocked} />
        ))}
        {column.items.length === 0 && (
          <p className="px-1 text-sm text-muted opacity-60">비어있음</p>
        )}
      </div>
    </section>
  );
}
