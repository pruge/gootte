# brief — web-realtime (phase 2b)

> blueprint `project-manager` phase 2b. 부모 = [../blueprint.md](../blueprint.md) (scope·seam·M-0001 소비).

## 문제 · 동기
대시보드(2a)는 강력하지만 **자동 갱신이 안 된다** — 관리대상 문서(todo/sprint/roadmap/profile)나 worktree가 바뀌어도 사용자가 **수동 새로고침**해야 반영된다. INV-3("뷰는 항상 현재 SoT 반영")를 CLI는 호출 시 재계산으로 지키지만, **웹은 아직 못 지킨다**. "프로젝트별 실시간 관리"라는 gootte 목적의 핵심 간극.

## 의도
파일 변경을 감지해 **서버가 클라에 "바뀜" 신호를 push** → 클라가 해당 쿼리를 invalidate → TanStack Query가 재조회 → **새로고침 없이 뷰가 즉시 최신 SoT를 반영**. INV-3의 웹 실현.

## scope / phase 경계
- **IN**: 파일 watcher(chokidar) · WebSocket push 채널 · 클라 구독→쿼리 invalidate(프로젝트 단위) · 프로젝트 목록 변화(추가/삭제) 반영.
- **OUT (이 phase 아님)**:
  - **.env 로그인 → phase 3(remote-mobile)로 이관** — localhost 단일 사용자엔 보호 대상이 없어 값이 없다. 로그인은 CF 터널 원격 노출 시 의미(blueprint 2b의 "로그인"을 3으로 정정). [ADR-0001]
  - **웹→서버 제어(명령)** — non-goal(관찰 전용). 단 **WS 양방향 채널로 열어둬** 후속(원격 제어)이 전송을 재발명하지 않게. [ADR-0002]

## 라이프사이클
서버 부팅 시 watcher 시작(발견된 프로젝트 docs 경로 감시) → 파일 이벤트 → debounce → WS 브로드캐스트 → 클라 invalidate. 클라 WS 끊기면 자동 재연결 + 재연결 시 전체 invalidate(끊긴 새 놓친 변경 흡수).

## 재사용 map (재발명 금지)
- **Hono `createApp`** — HTTP 라우트 그대로. WS는 server.ts에서 `@hono/node-ws` `injectWebSocket`으로 얹음(createApp은 테스트용 순수 유지).
- **TanStack Query 캐시** — 서버상태 SoT(INV-1). WS는 `invalidateQueries`만 트리거(별 스토어 X). query.ts 주석이 이미 예고("2b WS가 invalidate로 확장").
- **discover-cache** — 프로젝트 목록 TTL 캐시. 프로젝트 추가/삭제 시 `clearDiscoverCache()` + projects 쿼리 invalidate.
- **core-io IO 층** — watcher는 fs IO → core-io에 `watchProjects(roots, onChange)` 신규(blueprint architecture: "core-io = fs read·discover·git·emit").
- **per-request 재계산** — 변경 없음. WS는 재조회를 *촉발*만, 계산은 기존 endpoint 그대로.

## non-goal
제어(명령 실행) · 다중 사용자/권한(phase 6) · 원격 노출·터널(phase 3) · fine-grained(뷰별) invalidation(프로젝트 단위로 충분).

## future
- WS 양방향 채널 → 원격 제어(후속 phase, seam 예약).
- 로그인/auth → phase 3(원격) · phase 6(multi-user).

## ADR 색인
- [ADR-0001](adr/0001-scope-realtime-only.md) — scope = 실시간만, 로그인 phase 3 이관.
- [ADR-0002](adr/0002-transport-websocket.md) — 전송 = WebSocket(양방향 채널, 후속 제어 대비).
- [ADR-0003](adr/0003-watcher-chokidar.md) — watcher = chokidar(신뢰성), 프로젝트 docs 경로 스코프.
- [ADR-0004](adr/0004-coarse-invalidation.md) — 프로젝트 단위 coarse invalidation + 목록 변화.

## 구조
[그림 M-0005](../../mermaid/INDEX.md#M-0005) — 파일변경 → chokidar → WS 브로드캐스트 → 클라 invalidate → refetch.
