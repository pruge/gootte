import { basename, dirname, join } from "node:path";
import { existsSync } from "node:fs";
import chokidar, { type FSWatcher } from "chokidar";

/**
 * firstmate 홈 백로그 감시(tauri-desktop-app T03) — tasks-axi 백로그 파일이 바뀌면 신호 하나.
 * 상태의 단일 출처는 백로그다(spec D4 사관장 확정 b안) — 그 파일이 바뀌는 순간을 놓치면 화면이
 * 옛 상태를 그린다(INV-3). 해석은 리더(T04)의 몫이고 여기선 "바뀌었다" 만 말한다(INV-4).
 *
 * 🔴 살아있는 `backlog.md` 뿐 아니라 `done-archive.md`(tasks-axi 가 오래된 done 항목을 옮겨
 * 두는 자리)도 같은 `data/` 디렉토리 안이라 이 감시기 하나가 둘 다 본다(tauri-desktop-app T05
 * 검수 — 완료된 하위 티켓이 아카이빙되면 조인이 끊기던 결함의 수정, `code/web/core-io/src/backlog.ts`).
 */

/** 백로그 파일 한 곳 — `<firstmateHome>/data/backlog.md`. 리더(T04)도 이 함수 하나를 지난다. */
export function backlogFile(firstmateHome: string): string {
  return join(firstmateHome, "data", "backlog.md");
}

/** 아카이브 백로그 파일 — `<firstmateHome>/data/done-archive.md`(tasks-axi 가 오래된 done 항목을 옮기는 자리). */
export function archivedBacklogFile(firstmateHome: string): string {
  return join(firstmateHome, "data", "done-archive.md");
}

export interface BacklogWatcher {
  close(): Promise<void>;
}

export interface WatchBacklogOptions {
  debounceMs?: number;
  /**
   * 감시를 못 붙였을 때의 통보 — stderr 기록과 함께 부른다. 폴백 폴러로 갈아타는 근거
   * (tauri-desktop-app T03)라 삼키지 않는다. 붙은 뒤의 오류도 같은 자리로 온다.
   */
  onError?: (err: unknown) => void;
}

/**
 * 백로그 파일 변경 감시 → coarse 콜백. INV-2(감시=read only, write 없음).
 *
 * 🔴 파일이 아니라 **부모 디렉토리**(depth 0)를 보고 파일명으로 걸러 본다(plan-watch 와 같은
 * 원칙) — tasks-axi 는 임시파일→rename 으로 교체하므로 파일 자체를 걸면 rename 순간 감시가
 * 떨어진다. 디렉토리는 이름이 불변이라 교체에 흔들리지 않는다.
 *
 * 🔴 홈이 미설정(null·빈 값)이거나 `data/` 가 아직 없으면 **감시기조차 세우지 않고** `onError`
 * 로 통보한다 — 없는 경로에 걸린 감시기는 조용히 아무것도 안 보는 stale 뷰(INV-3)와 구분이
 * 안 된다. 통보를 받은 소비처(backend watchers)가 폴백 폴러 신호를 내리고, 설정 재저장(rebind)
 * 때 다시 시도된다.
 */
export function watchBacklog(
  firstmateHome: string | null | undefined,
  onChange: () => void,
  opts: WatchBacklogOptions = {},
): BacklogWatcher {
  if (!firstmateHome?.trim()) return { async close() {} };
  const home = firstmateHome;

  const debounceMs = opts.debounceMs ?? 150;
  const target = backlogFile(home);
  const archivedTarget = archivedBacklogFile(home);
  const dir = dirname(target);

  if (!existsSync(dir)) {
    const err = new Error(`백로그 디렉토리가 없다: ${dir}`);
    process.stderr.write(`[watch] ${err.message} — 폴백 폴러로 대응한다\n`);
    opts.onError?.(err);
    return { async close() {} };
  }

  let pending: ReturnType<typeof setTimeout> | null = null;
  const fire = (): void => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      onChange();
    }, debounceMs);
  };

  const watcher: FSWatcher = chokidar.watch(dir, { ignoreInitial: true, depth: 0 });
  // 감시 실패가 서버를 죽이지 않게(watchProjects 와 같은 원칙) — 삼키지 않고 stderr 에 남긴다.
  watcher.on("error", (err) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[watch] 백로그 감시 실패(계속 진행): ${msg}\n`);
    opts.onError?.(err);
  });
  watcher.on("all", (_ev, abs) => {
    if (basename(abs) === basename(target) || basename(abs) === basename(archivedTarget)) fire();
  });

  return {
    async close() {
      if (pending) clearTimeout(pending);
      await watcher.close();
    },
  };
}
