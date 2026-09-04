import {
  IconAlertTriangle,
  IconFolder,
  IconFolderFilled,
  IconLoader2,
  IconTopologyStar3,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useProjects } from "../../lib/query";
import { ThemeToggle } from "../../theme/ThemeToggle";

/**
 * 배지가 아직 안 온 채로 이만큼 지나야 스피너를 띄운다(캡틴 지시 2026-09-04).
 *
 * 🔴 값은 보통 1~2초 안에 온다(서버가 백그라운드로 센다, read-path-redesign/T03).
 * 그 사이 스피너를 바로 띄우면 **잠깐 떴다 사라지는 깜빡임**이 되어 오히려 거슬린다.
 * 여유를 두고, 정말 안 오는 경우에만 "세는 중" 을 말한다.
 */
const SPINNER_DELAY_MS = 3_000;

/**
 * "배지가 하나라도 아직 안 왔고, 그 상태가 충분히 오래 갔는가."
 * 값이 다 차면 즉시 false 로 돌아가 타이머도 걷는다.
 */
function useSpinnerAfterDelay(anyMissing: boolean): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!anyMissing) {
      setReady(false);
      return;
    }
    const t = setTimeout(() => setReady(true), SPINNER_DELAY_MS);
    return () => clearTimeout(t);
  }, [anyMissing]);
  return ready;
}

interface SidebarProps {
  selected: string | null;
  onSelect: (slug: string) => void;
}

/** 자동발견 관리대상 프로젝트 목록. 선택 = URL `?p=<slug>`. Tabler 아이콘 전용. */
export function Sidebar({ selected, onSelect }: SidebarProps) {
  const { data, isLoading, isError, error } = useProjects();
  // 🔴 서버는 다시 세는 동안 **옛 값을 계속 내준다**(app.ts `invalidateOpenCount`) — 그래서
  // 여기서 undefined 인 것은 "한 번도 안 세어진" 프로젝트뿐이다. 그 경우에만 스피너를 고민한다.
  const showSpinner = useSpinnerAfterDelay((data ?? []).some((p) => p.openFeatures === undefined));

  return (
    <nav
      aria-label="프로젝트"
      className="flex w-60 shrink-0 flex-col border-r border-border bg-surface"
    >
      <div
        className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-4"
        title="gootte — 프로젝트 관리"
      >
        <IconTopologyStar3 size={28} className="shrink-0 text-accent" stroke={1.75} />
        <span className="truncate text-hero font-semibold tracking-tight">gootte</span>
      </div>
      <h2 className="mono px-4 pt-3 pb-2 text-sm font-semibold tracking-[0.15em] text-muted">
        PROJECTS
      </h2>

      {isLoading && (
        <p className="flex items-center gap-2 px-4 py-2 text-base text-muted">
          <IconLoader2 size={16} className="animate-spin" /> 발견 중…
        </p>
      )}

      {isError && (
        <p
          role="alert"
          className="mx-3 flex items-start gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-base text-drop"
        >
          <IconAlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>{error instanceof Error ? error.message : "목록 로드 실패"}</span>
        </p>
      )}

      <ul className="flex-1 overflow-y-auto px-2 py-1">
        {data?.map((p) => {
          const active = p.slug === selected;
          const Icon = active ? IconFolderFilled : IconFolder;
          return (
            <li key={p.slug}>
              <button
                type="button"
                aria-current={active ? "true" : undefined}
                onClick={() => onSelect(p.slug)}
                title={p.path}
                className={`group flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-base transition-colors ${
                  active
                    ? "bg-accent/12 text-fg"
                    : "text-muted hover:bg-surface-2 hover:text-fg"
                } focus-visible:outline-2 focus-visible:outline-accent`}
              >
                <Icon size={16} stroke={1.75} className={active ? "text-accent" : ""} />
                <span className="min-w-0 flex-1 truncate">{p.slug}</span>
                {/*
                  남은 일이 있는 기능 수 — 서버가 센 값을 싣기만 한다(재계산 X, INV-1).
                  🔴 0 이어도 감추지 않는다. 감추면 "다 끝났다" 와 "안 세어봤다"가 같은 화면이 된다.
                  0 은 조용한 색으로, 있을 때만 눈에 띄게 한다.

                  🔴 **아직 안 센 것은 스피너로 말한다**(캡틴 지시 2026-09-04). 서버는 배지를
                  요청 자리에서 세지 않고 백그라운드로 채우므로(read-path-redesign/T03), 첫 1~2초는
                  값이 없다. 그때 칸을 비워 두면 "배지가 없는 프로젝트" 처럼 보이고, 값이 튀어나오는
                  것도 거슬린다. **0 으로 채우는 것은 금지** — 그건 "다 끝났다" 는 거짓말이다.
                */}
                {p.openFeatures === undefined ? (
                  // 🔴 값이 없는 동안에도 **바로는 아무것도 안 그린다.** 3초를 넘겨야 스피너가 뜬다
                  // (`SPINNER_DELAY_MS`) — 보통 1~2초 안에 값이 오므로, 즉시 띄우면 스피너가
                  // 떴다 사라지는 깜빡임만 남는다(캡틴 피드백).
                  showSpinner && (
                    <span
                      role="status"
                      aria-label={`${p.slug} 남은 일 세는 중`}
                      title="남은 일을 세는 중…"
                      className="flex shrink-0 items-center rounded-full bg-surface-2 px-1.5 py-0.5 text-muted"
                    >
                      <IconLoader2 size={12} className="animate-spin" />
                    </span>
                  )
                ) : (
                  <span
                    title={`남은 일이 있는 기능 ${p.openFeatures}개`}
                    className={`mono shrink-0 rounded-full px-1.5 text-xs font-medium tabular-nums ${
                      p.openFeatures > 0 ? "bg-accent/15 text-accent" : "bg-surface-2 text-muted"
                    }`}
                  >
                    {p.openFeatures}
                  </span>
                )}
              </button>
            </li>
          );
        })}
        {data?.length === 0 && (
          <li className="px-2.5 py-2 text-base text-muted">발견된 프로젝트 없음</li>
        )}
      </ul>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border px-3 py-2.5">
        <span className="mono truncate text-sm text-muted">자동 발견 · {data?.length ?? 0}개</span>
        <ThemeToggle />
      </div>
    </nav>
  );
}
