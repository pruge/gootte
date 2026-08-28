import type { ChangeEvent } from "@gootte/contract";
import { discoverProjects, fetchOriginAsync, revalidateTicketGitStatus } from "@gootte/core-io";
import { revalidateSnapshot, snapshotProjects } from "./snapshot";

export const SNAPSHOT_REVALIDATION_INTERVAL_MS = 15_000;

export interface SnapshotRevalidator {
  run(): Promise<void>;
  setFallbackPolling(active: boolean): void;
  stop(): void;
}

export interface SnapshotRevalidatorOptions {
  dataDir: string;
  roots: () => string[];
  onChange: (event: ChangeEvent) => void;
}

/**
 * T04의 백그라운드 트리거. 부팅 1회, watch-fallback 중에는 기존 15초 안전망을 공유한다.
 * 🔴 비동기 — `fetchOrigin`(git network) 이 베팅 루프를 막아 첫 요청을 수십 초 미는 것을 막는다
 * (fast-cold-start, plan-board/13). 스냅샷이 있으면 트리 walk(`discoverProjects`) 도 안 하고
 * 스냅샷 목록으로만 fetch/검증한다.
 */
export function createSnapshotRevalidator(opts: SnapshotRevalidatorOptions): SnapshotRevalidator {
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  const run = (): Promise<void> => {
    if (running) return Promise.resolve();
    running = true;
    return (async () => {
      try {
        // T02 — clone 이 `origin/main` 을 따라가게 fetch 한 뒤, SHA 가 바뀐 사본만 티켓 리졸버
        // 캐시를 갱신한다. fetch 는 비파괴(`origin/main` 만 굴러감, grill D4)이고 **비동기**라
        // 기동을 가리지 않는다. SHA 게이트는 `revalidateTicketGitStatus` 가 자체 보유하므로
        // SHA 불변 시 git 로그를 호출하지 않는다.
        // 🔴 스냅샷이 있으면 트리 walk 없이 스냅샷 목록으로만 순회(fast-cold-start).
        const projects = snapshotProjects(opts.dataDir) ?? discoverProjects([...opts.roots()]);
        // 🔴 스냅샷(문서·사이드바 즉시 서빙용) 기록은 **fetch 완료를 기다리지 않고** 먼저 한다 —
        // fetch 가 16s 걸려도 첫 화면은 스냅샷으로 즉시 뜨게(fast-cold-start, plan-board/13).
        const result = revalidateSnapshot(opts.dataDir, opts.roots());
        if (result.projectsChanged) opts.onChange({ kind: "projects" });
        for (const slug of result.changedProjects) {
          if (!result.projectsChanged) opts.onChange({ kind: "project", project: slug });
        }
        // 🔴 fetch 는 비차단 백그라운드 — 끝나면 티켓 git 상태만 갱신(화면 알림). 스냅샷 기록을 막지 않는다.
        //
        // 🔴 동시(20+개) `git fetch` 는 CPU·디스크를 폭주시켜 같은 머신의 다른 상호작용을
        // 1s+ 멈추게 한다(fast-cold-start, plan-board/13 — 사용자가 "앱 새로 띄우고 첫 문서
        // 클릭이 1.4s" 라고 토로한 그 1.4s 가 정확히 이 폭주 구간에서 응답이 밀려서 생긴다).
        // 순차로 돌리면 총 시간은 같지만(event loop 차단 없음) 머신이 즉답 상태로 돌아와서
        // 첫 클릭 지연이 사라진다. 한 사본의 fetch 실패가 다음을 막지 않게 사본 단위로 잡는다.
        for (const project of projects) {
          for (const copy of project.copies) {
            await fetchOriginAsync(copy).catch(() => {});
          }
        }
        let ticketGitChanged = false;
        for (const project of projects) {
          for (const copy of project.copies) {
            if (revalidateTicketGitStatus(copy, opts.dataDir)) ticketGitChanged = true;
          }
        }
        // `origin/main` 이 움직여 새 완료가 생기면 화면이 다음 tick 에 본다(T02 → T03 소비).
        if (ticketGitChanged) opts.onChange({ kind: "ticket" });
      } finally {
        running = false;
      }
    })();
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
