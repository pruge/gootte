import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { ChangeEvent } from "@gootte/contract";

function liveUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/live`;
}

/**
 * WS `/api/live` 구독 → 서버 push(ChangeEvent)에 따라 쿼리 invalidate(2b, ADR-0004).
 * - kind:"project" → 그 프로젝트 쿼리(queryKey 에 slug 포함) invalidate.
 * - kind:"projects" → projects 쿼리 invalidate.
 * - 끊기면 backoff 재연결, 재연결 open 시 전체 invalidate(끊긴 새 놓친 변경 흡수).
 */
export function useLiveSync(qc: QueryClient): void {
  useEffect(() => {
    let ws: WebSocket | null = null;
    let disposed = false;
    let firstOpen = true;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let backoff = 500;

    const connect = (): void => {
      ws = new WebSocket(liveUrl());

      ws.onopen = () => {
        backoff = 500;
        if (firstOpen) {
          firstOpen = false;
        } else {
          void qc.invalidateQueries(); // 재연결 — 놓친 변경 흡수
        }
      };

      ws.onmessage = (e: MessageEvent) => {
        if (typeof e.data !== "string") return;
        let raw: unknown;
        try {
          raw = JSON.parse(e.data);
        } catch {
          return;
        }
        const parsed = ChangeEvent.safeParse(raw);
        if (!parsed.success) return;
        const ev = parsed.data;
        if (ev.kind === "projects") {
          void qc.invalidateQueries({ queryKey: ["projects"] });
        } else {
          void qc.invalidateQueries({
            predicate: (q) => Array.isArray(q.queryKey) && q.queryKey.includes(ev.project),
          });
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        retry = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 10_000);
      };
      ws.onerror = () => ws?.close();
    };
    connect();

    return () => {
      disposed = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, [qc]);
}
