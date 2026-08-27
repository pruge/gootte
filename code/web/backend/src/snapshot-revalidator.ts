import type { ChangeEvent } from "@gootte/contract";
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
      const result = revalidateSnapshot(opts.dataDir, opts.roots());
      if (result.projectsChanged) opts.onChange({ kind: "projects" });
      for (const slug of result.changedProjects) {
        if (!result.projectsChanged) opts.onChange({ kind: "project", project: slug });
      }
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
