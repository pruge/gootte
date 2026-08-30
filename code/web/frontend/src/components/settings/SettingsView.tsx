import { useEffect, useMemo, useRef, useState } from "react";
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

/** 좌측 레일의 카테고리 — VSCode 설정 트리와 같은 자리. 🔴 전역 설정이라 프로젝트와 무관하다. */
type CategoryId = "general" | "watch" | "hidden" | "theme";

const CATEGORIES: {
  id: CategoryId;
  label: string;
  icon: typeof IconHome;
  soon?: boolean;
}[] = [
  { id: "general", label: "일반", icon: IconHome },
  { id: "watch", label: "감시", icon: IconFolder },
  { id: "hidden", label: "숨김", icon: IconEyeOff },
  { id: "theme", label: "테마", icon: IconMoon, soon: true },
];

const CATEGORY_LABEL: Record<CategoryId, string> = {
  general: "일반",
  watch: "감시",
  hidden: "숨김",
  theme: "테마",
};

/**
 * 설정 화면 — 본문 영역에 그려지는 **전역** 설정 뷰(settings-in-main-area).
 *
 * VSCode 설정과 같은 골격: 좌측 레일(검색 + 카테고리) + 우측 폼. 각 설정 행은
 * 제목 → 설명 → 입력란 세로 스택(VSCode 배치). 저장은 명시적 "저장" 버튼(dirty 판정).
 *
 * 🔴 전역 하나다 — 프로젝트 선택과 무관하게 gear 로 열리는 같은 화면. 값 저장 정책은 그대로
 * `settings.json`(INV-5), 관리대상 문서엔 한 글자도 쓰지 않는다(INV-2). 존재 여부·유효 뿌리는
 * 서버가 응답 때 다시 본 값(`*Exists`·`effectiveWatchRoots`, INV-3)을 그대로 릴레이한다.
 *
 * 입력 칸 동기는 두 순간뿐이다(F4 규율): **마운트 시** (본문 배치라 마운트 = 열림)과 **저장 성공**
 * (본문 배치라 마운트 = 열림)과 **저장 성공**(정규화된 결과 반영). 마운트 후 다른 캐시
 * 무효화(WS 재접 등)가 `useSettings` 를 다시 불러와도 사용자가 타고 있는 미저장 입력을
 * 덮어쓰지 않는다.
 */
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
  /** 마운트 시 한 번만 서버 값으로 채운다(F4 — 이후 data 변화는 무시). */
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current || !data) return;
    seededRef.current = true;
    setFirstmateHome(data.firstmateHome ?? "");
    // 감시 폴더 편집기는 실제 감시 중인 뿌리로 미리 채운다(per-folder-watch-roots) — 사용자가
    // 현재 보고 있는 항목을 보고 뺄 항목을 고르게 한다. 키가 없으면 firstmate 홈에서 파생된 값.
    setWatchRoots(data.effectiveWatchRoots ?? []);
  }, [data]);

  // 저장 성공 — 서버가 정규화해 돌려준 값을 입력 칸에 앉힌다(2차 사본이 아니라 판정값).
  useEffect(() => {
    if (!save.isSuccess || !save.data) return;
    setFirstmateHome(save.data.firstmateHome ?? "");
    setWatchRoots(save.data.effectiveWatchRoots ?? []);
  }, [save.isSuccess, save.data]);

  const dirty =
    firstmateHome !== (data?.firstmateHome ?? "") ||
    watchRoots.join("\u0000") !== (data?.effectiveWatchRoots ?? []).join("\u0000");

  // 존재하지 않는 경로 경고 — 서버가 응답 때 다시 본 값(INV-3)과 폴더 선택 실패 둘을 한 줄로.
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

  /** 차단 해제 — 저장된 목록에서 이 slug 를 빼고 다시 저장한다(blockedCopies 부분 갱신). */
  const unblock = (slug: string) => {
    const current = data?.blockedCopies ?? [];
    block.mutate(current.filter((s) => s !== slug));
  };

  const submit = () => {
    const trimToNull = (v: string) => {
      const t = v.trim();
      return t === "" ? null : t;
    };
    setSavedAt(null);
    save.mutate(
      { firstmateHome: trimToNull(firstmateHome), watchRoots },
      { onSuccess: () => setSavedAt(Date.now()) },
    );
  };

  // 검색 — 카테고리 이름 매칭(VSCode 의 "설정 검색"과 같은 자리). 순수 프론트 필터다.
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
      {/* 좌측 레일 — 검색 + 카테고리(VSCode 설정 사이드바) */}
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
                {c.soon && (
                  <span className="rounded-full border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                    예정
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* 우측 폼 */}
      <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mb-1 flex items-center gap-1.5 text-sm text-muted">
          <span>설정</span>
          <span className="opacity-60">›</span>
          <span>{CATEGORY_LABEL[activeCategory]}</span>
          {CATEGORIES.find((c) => c.id === activeCategory)?.soon && (
            <span className="rounded-full border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted">
              예정
            </span>
          )}
        </div>
        <h2 className="text-2xl font-bold tracking-tight">{CATEGORY_LABEL[activeCategory]}</h2>
        <p className="mt-1 mb-5 text-sm text-muted">
          {activeCategory === "general" &&
            "백로그 조인에 쓰는 firstmate 홈 위치를 정합니다."}
          {activeCategory === "watch" && "gootte 가 살펴볼 projects 폴더 뿌리를 하나씩 추가합니다."}
          {activeCategory === "hidden" &&
            "기능 탭에서 숨긴 작업 가지(트리하우스 복사본)를 관리합니다."}
          {activeCategory === "theme" && "확장성 시연용 — 아직 구현되지 않았습니다."}
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
            <ul className="flex flex-col gap-1.5">
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
            <div className="flex items-center gap-2">
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
            <ul className="flex flex-col gap-1.5">
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
            hint="다크 모드는 사이드바 하단 토글에 있습니다. 설정 안에도 두는 자리는 이 자리입니다."
          >
            <input
              type="text"
              disabled
              value="시스템 기본"
              className="mono min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm opacity-50"
            />
          </SettingRow>
        )}

        {save.isError && (
          <p role="alert" className="mt-4 flex items-start gap-2 text-base text-drop">
            <IconAlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>{save.error instanceof Error ? save.error.message : "저장 실패"}</span>
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          {savedAt !== null && save.isSuccess && (
            <span className="inline-flex items-center gap-1 text-sm text-accent" role="status">
              <IconCheck size={15} /> 저장했습니다 — 바로 적용됩니다
            </span>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={!dirty || save.isPending}
            className="rounded-md bg-accent px-3.5 py-1.5 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

/** 설정 행 하나 — VSCode 배치: 제목 → 설명 → 입력란(세로 스택). */
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