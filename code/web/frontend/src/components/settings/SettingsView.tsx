import { useEffect, useMemo, useState } from "react";
import {
  IconAlertTriangle,
  IconCheck,
  IconEye,
  IconEyeOff,
  IconFolder,
  IconFolderOpen,
  IconHome,
  IconMoon,
  IconPlus,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { useBlockedCopies, useSaveSettings, useSettings } from "../../lib/query";
import { isTauri, pickFolder } from "../../lib/tauri";
import { ThemeToggle } from "../../theme/ThemeToggle";

type CategoryId = "general" | "watch" | "hidden" | "theme";

const CATEGORIES: {
  id: CategoryId;
  label: string;
  icon: typeof IconHome;
}[] = [
  { id: "general", label: "일반", icon: IconHome },
  { id: "watch", label: "감시", icon: IconFolder },
  { id: "hidden", label: "숨김", icon: IconEyeOff },
  { id: "theme", label: "테마", icon: IconMoon },
];

const CATEGORY_LABEL: Record<CategoryId, string> = {
  general: "일반",
  watch: "감시",
  hidden: "숨김",
  theme: "테마",
};

export function SettingsView() {
  const { data } = useSettings();
  const save = useSaveSettings();
  const block = useBlockedCopies();
  const [category, setCategory] = useState<CategoryId>("general");
  const [query, setQuery] = useState("");
  const [firstmateHome, setFirstmateHome] = useState("");
  const [watchRoots, setWatchRoots] = useState<string[]>([]);
  const [newRoot, setNewRoot] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [pickErrorFirstmateHome, setPickErrorFirstmateHome] = useState<string | null>(null);
  const [pickErrorWatchRoots, setPickErrorWatchRoots] = useState<string | null>(null);
  /** 시드 완료 — 다음 렌더에서 true, 그 후부터 자동저장 활성화 */
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (seeded || !data) return;
    setFirstmateHome(data.firstmateHome ?? "");
    setWatchRoots(data.effectiveWatchRoots ?? []);
    setSeeded(true);
  }, [seeded, data]);

  useEffect(() => {
    if (!save.isSuccess || !save.data) return;
    setFirstmateHome(save.data.firstmateHome ?? "");
    setWatchRoots(save.data.effectiveWatchRoots ?? []);
  }, [save.isSuccess, save.data]);

  const dirty =
    firstmateHome !== (data?.firstmateHome ?? "") ||
    watchRoots.join("\u0000") !== (data?.effectiveWatchRoots ?? []).join("\u0000");

  // 자동 저장 — 변경 시 500ms 뒤 저장, 저장 버튼 없음(VSCode 스타일)
  useEffect(() => {
    if (!seeded || !data || !dirty || save.isPending) return;
    const t = setTimeout(() => {
      const trimToNull = (v: string) => {
        const c = v.trim();
        return c === "" ? null : c;
      };
      save.mutate(
        { firstmateHome: trimToNull(firstmateHome), watchRoots },
        { onSuccess: () => setSavedAt(Date.now()) },
      );
    }, 500);
    return () => clearTimeout(t);
  }, [seeded, firstmateHome, watchRoots, dirty, data]);

  const firstmateHomeWarning =
    data && data.firstmateHome !== null && !data.firstmateHomeExists
      ? `이 경로가 없거나 폴더가 아닙니다: ${data.firstmateHome}`
      : pickErrorFirstmateHome;

  const addRootPath = (raw: string) => {
    const t = raw.trim();
    if (t === "" || watchRoots.includes(t)) return;
    setWatchRoots((prev) => [...prev, t]);
  };
  const addRoot = () => {
    addRootPath(newRoot);
    setNewRoot("");
  };
  const pickWatchRoot = () => {
    setPickErrorWatchRoots(null);
    pickFolder()
      .then((p) => {
        if (p !== null) {
          addRootPath(p);
          setNewRoot("");
        }
      })
      .catch((e: unknown) => {
        setPickErrorWatchRoots(
          `폴더 선택 실패: ${e instanceof Error ? e.message : String(e)}`,
        );
      });
  };
  const removeRoot = (root: string) => setWatchRoots((prev) => prev.filter((r) => r !== root));

  const unblock = (slug: string) => {
    const current = data?.blockedCopies ?? [];
    block.mutate(current.filter((s) => s !== slug));
  };

  const q = query.trim().toLowerCase();
  const visibleCategories = useMemo(
    () =>
      CATEGORIES.filter(
        (c) => !q || c.label.toLowerCase().includes(q) || c.id.includes(q),
      ),
    [q],
  );
  const activeCategory = visibleCategories.some((c) => c.id === category)
    ? category
    : (visibleCategories[0]?.id ?? "general");

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-surface">
        <div className="relative p-3 pb-1">
          <IconSearch
            size={15}
            className="pointer-events-none absolute top-1/2 left-6 -translate-y-1/2 text-muted"
            stroke={1.75}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="설정 검색…"
            aria-label="설정 검색"
            className="w-full appearance-none rounded-md border border-border bg-surface-2 py-1.5 pr-2 pl-8 text-sm text-fg outline-none placeholder:text-muted/60 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent"
          />
        </div>
        <nav aria-label="설정 카테고리" className="min-h-0 flex-1 overflow-y-auto p-2">
          {visibleCategories.map((c) => {
            const Icon = c.icon;
            const active = c.id === activeCategory;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                aria-current={active ? "true" : undefined}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
                  active
                    ? "bg-accent/12 font-semibold text-fg"
                    : "text-muted hover:bg-surface-2 hover:text-fg"
                } focus-visible:outline-2 focus-visible:outline-accent`}
              >
                <Icon size={16} stroke={1.75} className={active ? "text-accent" : ""} />
                <span className="min-w-0 flex-1">{c.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mb-1 flex items-center justify-between gap-3 text-sm text-muted">
          <div className="flex items-center gap-1.5">
            <span>설정</span>
            <span className="opacity-60">›</span>
            <span>{CATEGORY_LABEL[activeCategory]}</span>
          </div>
          {save.isPending ? (
            <span className="text-xs text-muted">저장 중…</span>
          ) : savedAt !== null && save.isSuccess ? (
            <span className="inline-flex items-center gap-1 text-xs text-accent" role="status">
              <IconCheck size={14} /> 저장됨
            </span>
          ) : null}
        </div>
        <h2 className="text-2xl font-bold tracking-tight">{CATEGORY_LABEL[activeCategory]}</h2>
        <p className="mt-1 mb-5 text-sm text-muted">
          {activeCategory === "general" &&
            "백로그 조인에 쓰는 firstmate 홈 위치를 정합니다."}
          {activeCategory === "watch" && "gootte 가 살펴볼 projects 폴더 뿌리를 하나씩 추가합니다."}
          {activeCategory === "hidden" &&
            "기능 탭에서 숨긴 작업 가지(트리하우스 복사본)를 관리합니다."}
          {activeCategory === "theme" && "화면 테마를 system · dark · light 중 고릅니다."}
        </p>

        {activeCategory === "general" && (
          <SettingRow
            title="firstmate 홈 경로"
            hint="신관례(tickets/T<NN>.md) 티켓 상태의 단일 출처인 백로그 조인에만 씁니다. 감시 뿌리와는 무관합니다 — 비워 두면 백로그 조인이 꺼집니다."
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={firstmateHome}
                onChange={(e) => setFirstmateHome(e.target.value)}
                spellCheck={false}
                placeholder={data?.firstmateHomeSuggestion ?? "/절대/경로"}
                aria-label="firstmate 홈 경로"
                className="mono min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm outline-none placeholder:text-muted/60 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent"
              />
              {isTauri() && (
                <button
                  type="button"
                  onClick={() => {
                    setPickErrorFirstmateHome(null);
                    pickFolder()
                      .then((p) => {
                        if (p !== null) setFirstmateHome(p);
                      })
                      .catch((e: unknown) => {
                        setPickErrorFirstmateHome(
                          `폴더 선택 실패: ${e instanceof Error ? e.message : String(e)}`,
                        );
                      });
                  }}
                  className="mono inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-muted transition-colors hover:border-accent hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <IconFolderOpen size={16} stroke={1.75} /> 찾아보기…
                </button>
              )}
            </div>
            {firstmateHomeWarning && <Warning text={firstmateHomeWarning} />}
          </SettingRow>
        )}

        {activeCategory === "watch" && (
          <SettingRow
            title={`감시 폴더 목록 (${watchRoots.length})`}
            hint="목록에서 빼면 그 폴더(와 그 사본)는 더 이상 감시되지 않습니다. 비워 두면 아무것도 감시하지 않습니다."
          >
            <ul className="flex flex-col gap-3">
              {watchRoots.map((root) => (
                <li key={root} className="flex items-center gap-2">
                  <span className="mono min-w-0 flex-1 truncate rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm">
                    {root}
                  </span>
                  <button
                    type="button"
                    aria-label="감시 목록에서 제거"
                    onClick={() => removeRoot(root)}
                    className="shrink-0 rounded p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-drop focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <IconTrash size={16} stroke={1.75} />
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                value={newRoot}
                onChange={(e) => setNewRoot(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addRoot();
                  }
                }}
                spellCheck={false}
                placeholder="/절대/경로/projects"
                aria-label="감시 폴더 추가 경로"
                className="mono min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm outline-none placeholder:text-muted/60 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent"
              />
              {isTauri() && (
                <button
                  type="button"
                  onClick={pickWatchRoot}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-muted transition-colors hover:border-accent hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <IconFolderOpen size={16} stroke={1.75} /> 찾아보기…
                </button>
              )}
              <button
                type="button"
                onClick={addRoot}
                disabled={newRoot.trim() === ""}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-muted transition-colors hover:border-accent hover:text-fg focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                <IconPlus size={16} stroke={1.75} /> 추가
              </button>
            </div>
            {pickErrorWatchRoots && <Warning text={pickErrorWatchRoots} />}
          </SettingRow>
        )}

        {activeCategory === "hidden" && (
          <SettingRow
            title={`차단한 작업 가지 (${(data?.blockedCopies ?? []).length})`}
            hint="실제 복사본은 그대로 남습니다 — 필요하면 여기서 해제하거나 트리하우스에서 직접 지울 수 있습니다."
          >
            <ul className="flex flex-col gap-3">
              {(data?.blockedCopies ?? []).map((slug) => (
                <li key={slug} className="flex items-center gap-2">
                  <span className="mono min-w-0 flex-1 truncate rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm">
                    {slug}
                  </span>
                  <button
                    type="button"
                    aria-label="차단 해제"
                    onClick={() => unblock(slug)}
                    className="shrink-0 rounded p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <IconEye size={16} stroke={1.75} />
                  </button>
                </li>
              ))}
            </ul>
            {(data?.blockedCopies ?? []).length === 0 && (
              <p className="text-sm text-muted">차단한 가지가 없으면 여기에 아무것도 보이지 않습니다.</p>
            )}
          </SettingRow>
        )}

        {activeCategory === "theme" && (
          <SettingRow
            title="화면 테마"
            hint="사이드바 하단 토글과 같은 설정입니다. system → dark → light 순서로 전환됩니다."
          >
            <ThemeToggle />
          </SettingRow>
        )}

        {save.isError && (
          <p role="alert" className="mt-4 flex items-start gap-2 text-base text-drop">
            <IconAlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>{save.error instanceof Error ? save.error.message : "저장 실패"}</span>
          </p>
        )}
      </div>
    </div>
  );
}

function SettingRow({
  title,
  hint,
  children,
}: {
  title: React.ReactNode;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border py-4 last:border-b-0">
      <h3 className="text-sm font-bold">{title}</h3>
      <p className="mt-1 mb-3 text-[12.5px] leading-relaxed text-muted">{hint}</p>
      {children}
    </div>
  );
}

function Warning({ text }: { text: string }) {
  return (
    <p role="alert" className="mt-2 flex items-start gap-1.5 text-sm text-drop">
      <IconAlertTriangle size={14} className="mt-0.5 shrink-0" />
      {text}
    </p>
  );
}