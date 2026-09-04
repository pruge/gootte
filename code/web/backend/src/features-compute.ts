/**
 * 기능 파생물 계산의 창구(read-path-redesign/T07) — 요청 스레드에서 **떼어 놓는다.**
 *
 * 왜: `readFeatures` 는 동기다. 그것이 메인 루프에서 도는 동안 **문서 클릭 요청은 소켓 큐에서
 * 파싱조차 되지 않는다**(spec §4 원인 A). 계산을 워커로 보내면 그 시간 동안에도 루프가 비어 있어
 * 드로어가 즉시 답한다 — "마지막 값 즉시 + 준비되면 교체"(adr/0001)가 그제서야 실제로 성립한다.
 *
 * 🔴 **워커가 못 뜨는 환경을 대비해 인라인 폴백을 둔다.** 이 저장소는 dev 도 프로덕션(Tauri)도
 * `tsx` 로 도는데(`backend/package.json` · `src-tauri/src/main.rs`), 워커 안에서 TS 로딩이 실패할
 * 여지가 있다. 그때 앱이 죽는 것보다 **예전처럼 인라인으로 계산하는 것**이 낫다 — 느릴 뿐 정확하다.
 * 어느 쪽으로 도는지는 `mode()` 가 말한다(조용히 넘어가지 않는다, INV-U1).
 */
import { Worker } from "node:worker_threads";
import type { Feature } from "@gootte/contract";
import type { CopyScan } from "@gootte/core";
import { readFeatures, scanWorkingCopies } from "@gootte/core-io";

export type ComputeMode = "worker" | "inline";

export interface ScanArgs {
  root: string;
  project: string;
  projectPaths: readonly string[];
  bbRoot?: string;
}

export interface FeaturesCompute {
  run(copies: readonly string[]): Promise<Feature[]>;
  /** 사본 관측(D 등급) — 같은 워커에서 돈다(T07 후속, T08 실측으로 필요성이 드러났다). */
  scan(args: ScanArgs): Promise<CopyScan>;
  mode(): ComputeMode;
  close(): Promise<void>;
}

interface Pending {
  resolve: (v: never) => void;
  reject: (e: Error) => void;
  /** 워커를 못 쓰게 됐을 때 그 자리에서 같은 답을 내는 길. */
  inline: () => unknown;
}

export function createFeaturesCompute(): FeaturesCompute {
  let worker: Worker | null = null;
  let mode: ComputeMode = "worker";
  let nextId = 1;
  const pending = new Map<number, Pending>();
  let closed = false;

  /** 워커가 죽거나 못 뜨면 인라인으로 내려앉는다 — 대기 중이던 요청은 그 자리에서 계산해 답한다. */
  const fallbackToInline = (why: string): void => {
    if (mode === "inline") return;
    mode = "inline";
    process.stderr.write(`[features-compute] 워커를 못 쓴다(${why}) — 인라인 계산으로 내려앉는다\n`);
    worker = null;
    for (const [id, p] of pending) {
      pending.delete(id);
      try {
        (p.resolve as (v: unknown) => void)(p.inline());
      } catch (err) {
        p.reject(err instanceof Error ? err : new Error(String(err)));
      }
    }
  };

  const ensureWorker = (): Worker | null => {
    if (mode === "inline" || closed) return null;
    if (worker) return worker;
    try {
      const w = new Worker(new URL("./features-worker.ts", import.meta.url));
      w.on("message", (m: { id: number; ok: boolean; features?: Feature[]; scan?: CopyScan; error?: string }) => {
        const p = pending.get(m.id);
        if (!p) return;
        pending.delete(m.id);
        if (pending.size === 0) w.unref(); // 유휴 — 프로세스 종료를 붙들지 않는다
        const value = m.features ?? m.scan;
        if (m.ok && value !== undefined) (p.resolve as (v: unknown) => void)(value);
        else p.reject(new Error(m.error ?? "features-worker: 알 수 없는 실패"));
      });
      w.on("error", (e) => fallbackToInline(e.message));
      w.on("exit", (code) => {
        if (!closed && code !== 0) fallbackToInline(`워커가 코드 ${code} 로 끝났다`);
      });
      // 🔴 유휴일 때만 unref 한다. 무조건 unref 하면 **대기 중이던 계산이 프로세스 종료로
      // 버려진다**(실측: 프로브가 "unsettled top-level await" 로 죽었다). 일이 있는 동안에는
      // ref 로 붙잡고, 다 끝나면 놓아 준다 — 서버는 어차피 살아 있고, 짧은 스크립트는 답을 받는다.
      w.unref();
      worker = w;
      return w;
    } catch (err) {
      fallbackToInline(err instanceof Error ? err.message : String(err));
      return null;
    }
  };

  /** 워커에 일을 하나 던지고 답을 기다린다. 워커를 못 쓰면 그 자리에서 `inline()` 로 답한다. */
  const dispatch = <T>(job: Record<string, unknown>, inline: () => T): Promise<T> => {
    const w = ensureWorker();
    if (!w) return Promise.resolve(inline());
    return new Promise<T>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve: resolve as (v: never) => void, reject, inline });
      w.ref(); // 답을 받을 때까지는 붙잡는다
      try {
        w.postMessage({ id, ...job });
      } catch (err) {
        pending.delete(id);
        if (pending.size === 0) w.unref();
        fallbackToInline(err instanceof Error ? err.message : String(err));
        resolve(inline());
      }
    });
  };

  return {
    run(copies) {
      const list = [...copies];
      return dispatch<Feature[]>({ kind: "features", copies: list }, () => readFeatures(list));
    },
    scan(args) {
      const paths = [...args.projectPaths];
      return dispatch<CopyScan>(
        { kind: "scan", root: args.root, project: args.project, projectPaths: paths, bbRoot: args.bbRoot },
        () => scanWorkingCopies(args.root, args.project, paths, args.bbRoot),
      );
    },
    mode: () => mode,
    async close() {
      closed = true;
      const w = worker;
      worker = null;
      if (w) await w.terminate();
    },
  };
}

/**
 * 프로세스에 하나뿐인 계산 창구(read-path-redesign/T07 후속).
 *
 * 🔴 왜 공유가 필요한가: `app.ts` 만 워커를 쓰고 `snapshot.ts`(부팅 재검증 · 감시 갱신)가
 * 인라인으로 남았더니, **부팅 직후 문서 API 가 1,296ms 막혔다**(실측 2026-09-04, T08).
 * 계산하는 자리가 하나라도 메인 루프에 남아 있으면 "줄 안 섬" 은 성립하지 않는다.
 * 워커를 둘 띄우면 폴더 캐시도 둘로 갈라지므로 **하나를 공유**한다.
 */
let shared: FeaturesCompute | null = null;

export function sharedFeaturesCompute(): FeaturesCompute {
  shared ??= createFeaturesCompute();
  return shared;
}

export async function closeSharedFeaturesCompute(): Promise<void> {
  const c = shared;
  shared = null;
  if (c) await c.close();
}
