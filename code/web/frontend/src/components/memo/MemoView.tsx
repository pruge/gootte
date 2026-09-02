import { useEffect, useRef, useState } from "react";
import { IconNote, IconSearch, IconTrash, IconDeviceFloppy, IconCircleCheck, IconCircle } from "@tabler/icons-react";
import type { Memo } from "@gootte/contract";
import { useMemos, useCreateMemo, useUpdateMemo, useDeleteMemo } from "../../lib/query";
import { Loading, ErrorMsg, Empty } from "../common/states";

/**
 * `memo` 탭 — 캡틴이 기능을 쓰기 전에 떠오르는 생각을 짧게 적어 두는 칸(memo-pad).
 *
 * - **왼쪽(1/3)**: 날짜별 메모 목록 + 검색 상자.
 * - **오른쪽(2/3)**: 선택한 날짜(또는 검색 결과)의 메모를 메모지 스타일로 보여주고, 바로 수정·삭제.
 *
 * 🔴 메모는 gootte 자기 저장소(`GOOTTE_DATA_DIR`/memos/<project>.json)에만 쓴다 —
 * 관리대상(INV-2) 문서를 한 글자도 건드리지 않는다. 캡틴의 생각(INV-5)이라 저장할 자격이 있다.
 */

const iconBtn =
  "inline-flex items-center justify-center rounded p-1 text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent";

export function MemoView({ project }: { project: string }) {
  const { data, isError, error } = useMemos(project);
  const createMemo = useCreateMemo(project);
  const updateMemo = useUpdateMemo(project);
  const deleteMemo = useDeleteMemo(project);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [newContent, setNewContent] = useState("");
  const [query, setQuery] = useState("");
  const newInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = newInputRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [newContent]);

  if (isError && !data) return <ErrorMsg error={error} />;
  if (!data) return <Loading label="메모를 읽는 중…" />;

  const { memos } = data;

  // 날짜별 그룹화 — `createdAt` ISO 의 앞 10자(YYYY-MM-DD)
  const byDate = new Map<string, Memo[]>();
  for (const m of memos) {
    const date = m.createdAt.slice(0, 10);
    const list = byDate.get(date) ?? [];
    list.push(m);
    byDate.set(date, list);
  }
  // 날짜 내림차순 정렬
  const sortedDates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));

  const q = query.trim().toLowerCase();
  // 검색어(메모 내용) + 선택한 날짜 로 필터링 — 둘 다 있으면 교집합
  const filteredMemos = memos.filter((m) => {
    const dateOk = !selectedDate || m.createdAt.slice(0, 10) === selectedDate;
    const textOk = !q || m.content.toLowerCase().includes(q);
    return dateOk && textOk;
  });
  // filteredMemos 를 최신순(createdAt 내림차순)으로 정렬
  const sortedMemos = [...filteredMemos].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const handleAdd = () => {
    const text = newContent.trim();
    if (!text) return;
    createMemo.mutate(text, {
      onSuccess: () => {
        setNewContent("");
        // 현재 날짜 선택·검색어를 그대로 둔다 — 저장했다고 보던 화면을 바꾸지 않는다.
        // 목록은 캐시 무효화로 새로 읽혀 방금 추가한 메모가 그 자리에 선다(INV-3).
      },
    });
  };

  return (
    <div className="flex h-full min-h-0">
      {/* 왼쪽 컬럼 — 날짜 목록 + 검색 */}
      <aside className="w-1/3 shrink-0 overflow-y-auto border-r border-border pr-2">
        <h2 className="mono px-2 pt-1 pb-2 text-sm font-semibold tracking-[0.15em] text-muted">
          MEMOS
        </h2>
        <div className="relative mb-2 px-2">
          <IconSearch
            size={14}
            stroke={1.75}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="메모 검색…"
            aria-label="메모 검색"
            className="w-full rounded-md border border-border bg-surface-2/40 py-1.5 pr-2.5 pl-8 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>
        <ul className="flex flex-col gap-0.5">
          <li>
            <button
              type="button"
              onClick={() => setSelectedDate(null)}
              aria-current={selectedDate === null ? "true" : undefined}
              className={`flex w-full items-baseline gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                selectedDate === null
                  ? "bg-accent/12 font-semibold text-fg"
                  : "text-muted hover:bg-surface-2 hover:text-fg"
              } focus-visible:outline-2 focus-visible:outline-accent`}
            >
              <IconNote size={14} stroke={1.5} />
              <span className="min-w-0 flex-1 truncate">전체</span>
              <span className="mono shrink-0 text-xs tabular-nums text-muted">{memos.length}</span>
            </button>
          </li>
          {sortedDates.map((date) => {
            const count = byDate.get(date)?.length ?? 0;
            return (
              <li key={date}>
                <button
                  type="button"
                  onClick={() => setSelectedDate(date)}
                  aria-current={selectedDate === date ? "true" : undefined}
                  className={`flex w-full items-baseline gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                    selectedDate === date
                      ? "bg-accent/12 font-semibold text-fg"
                      : "text-muted hover:bg-surface-2 hover:text-fg"
                  } focus-visible:outline-2 focus-visible:outline-accent`}
                >
                  <span className="min-w-0 flex-1 truncate">{date}</span>
                  <span className="mono shrink-0 text-xs tabular-nums text-muted">{count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* 오른쪽 컬럼 — 메모지 목록 */}
      <div className="min-w-0 flex-1 overflow-y-auto pl-4">
        {/* 새 메모 입력 */}
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-border bg-surface-2/40 p-3">
          <textarea
            ref={newInputRef}
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder="떠오르는 생각을 적어 보세요…"
            rows={2}
            className="min-h-[2.5rem] w-full resize-none overflow-hidden bg-transparent text-sm text-fg placeholder:text-muted focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!newContent.trim() || createMemo.isPending}
            className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-colors hover:bg-accent/90 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent"
          >
            {createMemo.isPending ? "저장 중…" : "저장"}
          </button>
        </div>

        {/* 메모 목록 */}
        {sortedMemos.length === 0 ? (
          <Empty>메모가 없습니다.</Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {sortedMemos.map((memo) => (
              <MemoNote
                key={memo.id}
                memo={memo}
                onSave={(content) => updateMemo.mutate({ id: memo.id, content })}
                onToggleDone={(done) => updateMemo.mutate({ id: memo.id, content: memo.content, done })}
                onDelete={() => deleteMemo.mutate(memo.id)}
                isSaving={updateMemo.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** 메모지 한 장 — sticky note 스타일, 바로 수정·삭제. 체크(완료)로 취소선을 건다. */
function MemoNote({
  memo,
  onSave,
  onToggleDone,
  onDelete,
  isSaving,
}: {
  memo: Memo;
  onSave: (content: string) => void;
  onToggleDone: (done: boolean) => void;
  onDelete: () => void;
  isSaving: boolean;
}) {
  const [editing, setEditing] = useState(memo.content);
  // 저장 후 편집 상태를 저장된 내용으로 갱신
  const [savedContent, setSavedContent] = useState(memo.content);
  const dirty = editing !== savedContent;

  const handleSave = () => {
    onSave(editing);
    setSavedContent(editing);
  };

  const time = memo.createdAt;
  const date = time.slice(0, 10);
  const clock = time.slice(11, 19);

  return (
    <div
      className={`overflow-hidden rounded-lg border shadow-sm ${
        memo.done
          ? "border-border bg-surface-2/60 dark:border-border dark:bg-surface-2/40"
          : "border-border bg-surface-2 dark:border-border dark:bg-surface"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="mono shrink-0 text-xs text-amber-800 dark:text-muted">
          {date} {clock}
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onToggleDone(!memo.done)}
            aria-label={memo.done ? "완료 해제" : "완료로 표시"}
            title={memo.done ? "완료 해제" : "완료로 표시"}
            className={`${iconBtn} ${memo.done ? "text-accent" : ""}`}
          >
            {memo.done ? (
              <IconCircleCheck size={15} stroke={2} />
            ) : (
              <IconCircle size={15} stroke={1.75} />
            )}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || isSaving}
            aria-label="저장"
            title="저장"
            className={`${iconBtn} ${dirty ? "text-accent" : "opacity-30"}`}
          >
            <IconDeviceFloppy size={14} stroke={1.75} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="삭제"
            title="삭제"
            className={`${iconBtn} hover:text-drop!`}
          >
            <IconTrash size={14} stroke={1.75} />
          </button>
        </span>
      </div>
      <textarea
        value={editing}
        onChange={(e) => setEditing(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (dirty) handleSave();
          }
        }}
        className={`min-h-[4rem] w-full resize-none bg-transparent px-3 py-2 text-sm placeholder:text-muted focus:outline-none ${
          memo.done
? "text-muted line-through decoration-2 decoration-strike"
          : "text-fg"
        }`}
        placeholder="내용 없음"
      />
    </div>
  );
}