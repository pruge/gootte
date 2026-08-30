import { useEffect, useRef, useState } from "react";
import {
  IconAlertTriangle,
  IconCheck,
  IconEye,
  IconFolderOpen,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useBlockedCopies, useSaveSettings, useSettings } from "../../lib/query";
import { isTauri, pickFolder } from "../../lib/tauri";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 설정(tauri-desktop-app T02, per-folder-watch-roots 로 한 칸화) — 두 칸.
 *
 * - **감시 폴더 목록(`watchRoots`)**: 사용자가 감시할 projects 폴더를 하나씩 추가한다. 목록에서
 *   빼면 그 폴더(와 그 사본)는 더 이상 감시되지 않는다. firstmate 구조에 종속되지 않는다.
 *   미설정(키 없음)이면 기존처럼 firstmate 홈에서 뿌리를 파생한다 — 점진적 전환을 위해.
 * - **firstmate 홈 경로**: 이제 감시 뿌리 파생이 아니라 **백로그 조인**(신관례 티켓 상태 단일
 *   출처)에만 쓰인다. 비어 있으면 백로그 조인이 꺼진다.
 *
 * 🔴 입력 칸의 빈 값은 **지움(unset)** 이다 — 지우면 서버가 null 을 저장하고 소비처는 기본값으로
 * 떨어진다. "기본값으로 돌아가는" 길이 이것 하나뿐이라 별도 버튼을 두지 않는다.
 *
 * 존재하지 않는 경로도 저장한다(사용자가 미리 경로를 정해 둘 수 있다) — 대신 응답의
 * `*Exists`(서버가 응답 때 다시 본 값, INV-3)를 경고로 보여 준다.
 */
export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { data } = useSettings();
  const save = useSaveSettings();
  const block = useBlockedCopies();
  const [firstmateHome, setFirstmateHome] = useState("");
  const [watchRoots, setWatchRoots] = useState<string[]>([]);
  const [newRoot, setNewRoot] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [pickErrorFirstmateHome, setPickErrorFirstmateHome] = useState<string | null>(null);
  const [pickErrorWatchRoots, setPickErrorWatchRoots] = useState<string | null>(null);
  /** 열림 전환 감지 — data 가 바뀔 때마다가 아니라 닫힘→열림 전환에서만 입력을 채운다(F4). */
  const wasOpenRef = useRef(false);

  /**
   * 입력 칸 동기는 두 순간뿐이다(review F4): **열리는 전환**(서버 값 채우기)과 **저장 성공**
   * (정규화된 저장 결과 반영 — `~/x` 를 보냈으면 전개된 경로로 도착한다). 대화상자가 열려 있는
   * 동안의 다른 캐시 무효화(WS 재접 등)가 useSettings 를 다시 불러와도 사용자가 타고 있는
   * 미저장 입력을 덮어쓰지 않는다.
   */
  useEffect(() => {
    if (open && !wasOpenRef.current && data) {
      setFirstmateHome(data.firstmateHome ?? "");
      // 감시 폴더 편집기는 실제 감시 중인 뿌리로 미리 채운다(per-folder-watch-roots) — 사용자가
      // 현재 보고 있는 항목을 보고 뺄 항목을 고르게 한다. 키가 없으면 firstmate 홈에서 파생된 값.
      setWatchRoots(data.effectiveWatchRoots ?? []);
    }
    wasOpenRef.current = open;
  }, [open, data]);

  // 저장 성공 — 서버가 정규화해 돌려준 값을 입력 칸에 앉힌다(2차 사본이 아니라 판정값).
  useEffect(() => {
    if (!save.isSuccess || !save.data) return;
    setFirstmateHome(save.data.firstmateHome ?? "");
    setWatchRoots(save.data.effectiveWatchRoots ?? []);
  }, [save.isSuccess, save.data]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const dirty =
    firstmateHome !== (data?.firstmateHome ?? "") ||
    watchRoots.join("\u0000") !== (data?.effectiveWatchRoots ?? []).join("\u0000");

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        aria-label="설정 닫기"
        className="absolute inset-0 bg-fg/20 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="설정"
        className="relative flex w-[min(640px,92vw)] flex-col border border-border bg-surface shadow-xl"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <h2 className="text-lg font-semibold tracking-tight">설정</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="shrink-0 rounded p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
          >
            <IconX size={18} />
          </button>
        </header>

        <div className="flex flex-col gap-5 px-5 py-4">
          <Field
            id="settings-firstmate-home"
            label="firstmate 홈 경로"
            hint="이 홈은 감시 뿌리와는 무관하다 — 신관례(`tickets/T<NN>.md`) 티켓 상태의 단일 출처인 백로그 조인에만 쓴다. 비어 있으면 백로그 조인이 꺼진다. 감시할 projects 폴더는 아래 목록에서 직접 추가한다."
            placeholder={data?.firstmateHomeSuggestion ?? undefined}
            value={firstmateHome}
            onChange={setFirstmateHome}
            existsWarning={
              data && data.firstmateHome !== null && !data.firstmateHomeExists
                ? `이 경로가 없거나 폴더가 아닙니다: ${data.firstmateHome}`
                : pickErrorFirstmateHome
            }
          >
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
          </Field>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">감시 폴더 목록</span>
              <span className="text-xs text-muted">
                {watchRoots.length === 0 ? "감시 중인 폴더 없음" : `${watchRoots.length}개 폴더`}
              </span>
            </div>
            <p className="text-sm text-muted">
              감시할 projects 폴더를 하나씩 추가한다. 목록에서 빼면 그 폴더(와 그 사본)는 더 이상
              감시되지 않는다. 비워 두면 아무것도 감시하지 않는다.
            </p>
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
            {pickErrorWatchRoots && (
              <p role="alert" className="flex items-start gap-1.5 text-sm text-drop">
                <IconAlertTriangle size={14} className="mt-0.5 shrink-0" />
                {pickErrorWatchRoots}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">차단한 작업 가지</span>
              <span className="text-xs text-muted">
                {(data?.blockedCopies ?? []).length === 0
                  ? "차단한 가지 없음"
                  : `${(data?.blockedCopies ?? []).length}개 숨김`}
              </span>
            </div>
            <p className="text-sm text-muted">
              기능 탭에서 "숨기기" 한 작업 가지(트리하우스 복사본) 목록 — 화면에 나타나지 않습니다.
              실제 복사본은 그대로 남으니, 필요하면 여기서 해제하거나 트리하우스에서 직접 지울 수 있습니다.
            </p>
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
          </div>

          {save.isError && (
            <p role="alert" className="flex items-start gap-2 text-base text-drop">
              <IconAlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>{save.error instanceof Error ? save.error.message : "저장 실패"}</span>
            </p>
          )}

          <div className="flex items-center justify-end gap-3">
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
    </div>
  );
}

interface FieldProps {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  /** 서버가 응답 때 다시 본 존재 여부가 false 일 때의 경고 문구(INV-3 — 화면이 재판정하지 않는다). */
  existsWarning: string | null;
  /** input placeholder — 미지정 시 일반 예시("/절대/경로"). 값이 있으면 브라우저가 알아서 안 보인다. */
  placeholder?: string;
  children?: React.ReactNode;
}

function Field({ id, label, hint, value, onChange, existsWarning, placeholder, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          placeholder={placeholder ?? "/절대/경로"}
          className="mono min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm outline-none placeholder:text-muted/60 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent"
        />
        {children}
      </div>
      {existsWarning ? (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-drop">
          <IconAlertTriangle size={14} className="mt-0.5 shrink-0" />
          {existsWarning}
        </p>
      ) : (
        <p className="text-sm text-muted">{hint}</p>
      )}
    </div>
  );
}
