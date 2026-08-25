import { basename } from "node:path";
import { mkdirSync } from "node:fs";
import chokidar, { type FSWatcher } from "chokidar";

export interface PlanWatcher {
  close(): Promise<void>;
}

/**
 * `plan.db`(gootte 자기 계획 저장소) 변경 감시 — coarse, 누가 바꿨는지는 모른다(development-order/07).
 * 브라우저 드래그도 CLI(`gootte set`/`drop`)도 결국 이 파일을 고치므로, **주체를 가리지 않고 하나로**
 * 잡는다 — CLI 는 서버 프로세스 밖이라 다른 방법이 없다(§설계).
 *
 * SQLite WAL 모드는 `plan.db-wal`·`plan.db-shm` 도 같이 건드리므로 셋 다 지켜본다.
 * 디렉토리 자체(`depth: 0`)를 보고 파일명으로 걸러 — 파일이 아직 없어도(첫 쓰기 전) 감시가 선다.
 */
export function watchPlanDb(
  dataDir: string,
  onChange: () => void,
  opts: { debounceMs?: number; onError?: (err: unknown) => void } = {},
): PlanWatcher {
  mkdirSync(dataDir, { recursive: true });
  const debounceMs = opts.debounceMs ?? 150;
  const dbBase = "plan.db";

  let pending: ReturnType<typeof setTimeout> | null = null;
  const fire = (): void => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      onChange();
    }, debounceMs);
  };

  const watcher: FSWatcher = chokidar.watch(dataDir, { ignoreInitial: true, depth: 0 });
  // 감시 실패가 서버를 죽이지 않게(watchProjects 와 같은 원칙) — 삼키지 않고 stderr 에 남긴다.
  watcher.on("error", (err) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[watch] plan.db 감시 실패(계속 진행): ${msg}\n`);
    // 감시 불가는 폴백 판단의 근거다(tauri-desktop-app T03) — 소비처가 폴러로 갈아타게 통보한다.
    opts.onError?.(err);
  });
  watcher.on("all", (_ev, abs) => {
    if (basename(abs).startsWith(dbBase)) fire();
  });

  return {
    async close() {
      if (pending) clearTimeout(pending);
      await watcher.close();
    },
  };
}
