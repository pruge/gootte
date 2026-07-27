# ADR-0002: 전송 = WebSocket (양방향 채널, 후속 제어 대비)

Status: accepted
Date: 2026-07-27 / 관련: spec.md §Architecture

## Context
서버→클라 "바뀜" push가 이 phase의 요구다. 한 방향만 보면 SSE(EventSource, 자동 재연결, HTTP)가 더 단순하다. 그러나 gootte는 향후 **웹→서버 제어/정보 전송**(원격 명령) 가능성이 있다.

## Decision
**WebSocket** 사용(`@hono/node-ws`). 지금은 서버→클라 push만 쓰지만(관찰 전용), **양방향 채널을 열어둬** 후속 원격 제어가 전송 계층을 재발명하지 않게 한다. WS는 server.ts에서 `createNodeWebSocket` + `injectWebSocket`, 라우트 `/api/live`.

## Alternatives
- **SSE**: 한 방향엔 더 단순·네이티브 재연결. 하지만 웹→서버가 생기면 별도 채널을 또 만들어야 함(이중 전송). 사용자 판단 = 미래 제어 대비 WS.
- raw `ws` 라이브러리: Hono 앱과 통합 안 됨 → `@hono/node-ws`가 적합.

## Consequences
- 재연결은 직접 구현(EventSource 자동재연결 없음) → useLiveSync가 backoff 재연결 + 재연결 시 전체 invalidate.
- 양방향 채널 확보 → 원격 제어 phase가 같은 `/api/live`에 클라→서버 메시지만 추가.
- vite dev proxy에 `ws: true` 필요(§Operations).

## Invariant impact
- **INV-4**: WS 메시지는 "바뀜" 신호(project slug)만 — 해석·요약 없음(결정적). 관찰 전용 유지(제어 메시지 미도입).

## Contract impact
`ChangeEvent`(서버→클라 메시지) net-new seam 추가 — spec §Data Model. 클라→서버 제어 메시지는 이 phase에서 미정의(후속).
