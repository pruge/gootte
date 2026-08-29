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
 * - kind:"plan" → 계획(DB) 워처는 project 를 모른다(development-order/07) — `plan` 쿼리 전부 invalidate.
 * - kind:"backlog" (tauri-desktop-app T03) → firstmate 홈 백로그가 바뀌었다(T04 조인 원천).
 *   어느 프로젝트 줄에 섞일지 모르는 coarse 신호라 전부 invalidate — 결정적 리더가 다시 읽는다(INV-4).
 * - kind:"watch-fallback" (T03) → 서버 FS 이벤트 감시 불과. `active:true` 면 폴백 폴러를
 *   돌려 주기 풀스캔으로 대응하고, `active:false` 가 오면 내린다. 이벤트가 안 온다는 뜻이지
 *   연결이 끊겼다는 뜻이 아니다 — WS 재연결 시의 전체 invalidate와는 별개다.
 * - 끊기면 backoff 재연결, 재연결 open 시 전체 invalidate(끊긴 새 놓친 변경 흡수).
 */

/** 폴백 폴링 주기 — 감시 불가 환경에서의 최악의 stale 폭. 수 초 반영 기준의 상한선이다. 15초로 조정하여 스피너 멈춤 문제 해결. */
const FALLBACK_POLL_MS = 15_000;

export function useLiveSync(qc: QueryClient): void {
  useEffect(() => {
    let ws: WebSocket | null = null;
    let disposed = false;
    let firstOpen = true;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let backoff = 500;
    /** 폴백 폴러 — watch-fallback active 동안만 살아 있는 타이머 하나. 평소엔 없다(CPU 안정). */
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const setFallbackPolling = (active: boolean): void => {
      if (active && !pollTimer) {
        // 🔴 `projects` 목록은 무거워 폴백 폴링에서 제외 — 문서 변경 신호가 올 때만 갱신한다.
        // 감시가 닫힌 환경에서 5초마다 목록을 다시 읽으면 스피너가 멈추지 않는다(fix/projects-listing-spin).
        pollTimer = setInterval(
          () =>
            void qc.invalidateQueries({
              predicate: (q) => !(Array.isArray(q.queryKey) && q.queryKey[0] === "projects"),
            }),
          FALLBACK_POLL_MS,
        );
      } else if (!active && pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

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
        } else if (ev.kind === "plan") {
          void qc.invalidateQueries({
            predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "plan",
          });
        } else if (ev.kind === "backlog") {
          // 백로그 조인은 어느 프로젝트/탭에 섞일지 모르는 coarse 신호다 — 전부 다시 읽는다.
          void qc.invalidateQueries();
        } else if (ev.kind === "watch-fallback") {
          setFallbackPolling(ev.active);
        } else {
          void qc.invalidateQueries({
            predicate: (q) => Array.isArray(q.queryKey) && q.queryKey.includes(ev.project),
          });
          // projects 목록의 worktree 카운트도 이 프로젝트 변경(worktree 추가/삭제 포함)에 갱신.
          void qc.invalidateQueries({ queryKey: ["projects"] });
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
      if (pollTimer) clearInterval(pollTimer);
      ws?.close();
    };
  }, [qc]);
}