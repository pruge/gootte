import type { ChangeEvent } from "@gootte/contract";
import { discoverProjects, fetchOrigin, revalidateTicketGitStatus } from "@gootte/core-io";
import { revalidateSnapshot } from "./snapshot";

export const SNAPSHOT_REVALIDATION_INTERVAL_MS = 15_000;

export interface SnapshotRevalidator {
  run(): void;
  setFallbackPolling(active: boolean): void;
  stop(): void;
}

export interface SnapshotRevalidatorOptions {
  dataDir: string;
  roots: () => string[];
  onChange: (event: ChangeEvent) => void;
}

/** T04의 백그라운드 트리거. 부팅 1회, watch-fallback 중에는 기존 15초 안전망을 공유한다. */
export function createSnapshotRevalidator(opts: SnapshotRevalidatorOptions): SnapshotRevalidator {
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  const run = (): void => {
    if (running) return;
    running = true;
    try {
      // T02 — clone 이 `origin/main` 을 따라가게 fetch 한 뒤, SHA 가 바뀐 사본만 티켓 리졸버
      // 캐시를 갱신한다. fetch 는 비파괴(`origin/main` 만 굴러감, grill D4). SHA 게이트는
      // `revalidateTicketGitStatus` 가 자체 보유하므로 SHA 불변 시 git 로그를 호출하지 않는다.
      let ticketGitChanged = false;
      for (const project of discoverProjects([...opts.roots()])) {
        for (const copy of project.copies) {
          fetchOrigin(copy);
          if (revalidateTicketGitStatus(copy, opts.dataDir)) ticketGitChanged = true;
        }
      }
      const result = revalidateSnapshot(opts.dataDir, opts.roots());
      if (result.projectsChanged) opts.onChange({ kind: "projects" });
      for (const slug of result.changedProjects) {
        if (!result.projectsChanged) opts.onChange({ kind: "project", project: slug });
      }
      // `origin/main` 이 움직여 새 완료가 생기면 화면이 다음 tick 에 본다(T02 → T03 소비).
      // 캡틴 push 를 대시보드가 늦게 못 따라가게 하는 반쪽.
      if (ticketGitChanged) opts.onChange({ kind: "projects" });
    } finally {
      running = false;
    }
  };

  const setFallbackPolling = (active: boolean): void => {
    if (active && timer === null) {
      timer = setInterval(run, SNAPSHOT_REVALIDATION_INTERVAL_MS);
    } else if (!active && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  return {
    run,
    setFallbackPolling,
    stop: () => setFallbackPolling(false),
  };
}
