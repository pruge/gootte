import { useEffect, useState } from "react";
import {
  IconAlertTriangle,
  IconCheck,
  IconFolderOpen,
  IconX,
} from "@tabler/icons-react";
import { useSaveSettings, useSettings } from "../../lib/query";
import { isTauri, pickFolder } from "../../lib/tauri";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 설정(tauri-desktop-app T02) — 감시 루트 폴더와 firstmate 홈 경로.
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
  const [watchRoot, setWatchRoot] = useState("");
  const [firstmateHome, setFirstmateHome] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // 서버 값이 도착하면(열림·무효화 재응답 포함) 입력 칸을 채운다 — 화면이 자기 판정 사본을
  // 만들지 않게 서버 값을 그대로 반영한다(INV-1).
  useEffect(() => {
    if (!open || !data) return;
    setWatchRoot(data.watchRoot ?? "");
    setFirstmateHome(data.firstmateHome ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- data 동기화는 열림·data 변화에만
  }, [open, data]);

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
    watchRoot !== (data?.watchRoot ?? "") ||
    firstmateHome !== (data?.firstmateHome ?? "");

  const submit = () => {
    const trimToNull = (v: string) => {
      const t = v.trim();
      return t === "" ? null : t;
    };
    setSavedAt(null);
    save.mutate(
      { watchRoot: trimToNull(watchRoot), firstmateHome: trimToNull(firstmateHome) },
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
            id="settings-watch-root"
            label="감시 루트 폴더"
            hint="이 폴더 아래의 프로젝트를 발견합니다. 비우면 기본 위치를 씁니다."
            value={watchRoot}
            onChange={setWatchRoot}
            existsWarning={
              data && data.watchRoot !== null && !data.watchRootExists
                ? `이 경로가 없거나 폴더가 아닙니다: ${data.watchRoot}`
                : null
            }
          >
            {isTauri() && (
              <button
                type="button"
                onClick={() => void pickFolder().then((p) => p !== null && setWatchRoot(p))}
                className="mono inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-muted transition-colors hover:border-accent hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
              >
                <IconFolderOpen size={16} stroke={1.75} /> 찾아보기…
              </button>
            )}
          </Field>

          <Field
            id="settings-firstmate-home"
            label="firstmate 홈 경로"
            hint="백로그 조인에 쓰는 firstmate 홈입니다. 비우면 기본값을 씁니다."
            value={firstmateHome}
            onChange={setFirstmateHome}
            existsWarning={
              data && data.firstmateHome !== null && !data.firstmateHomeExists
                ? `이 경로가 없거나 폴더가 아닙니다: ${data.firstmateHome}`
                : null
            }
          />

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
  children?: React.ReactNode;
}

function Field({ id, label, hint, value, onChange, existsWarning, children }: FieldProps) {
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
          placeholder="/절대/경로"
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
