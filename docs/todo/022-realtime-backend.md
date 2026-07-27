---
status: in_sprint
priority: normal
sprint: web-realtime
initiative: null
area: [web/contract, web/core-io, web/backend]
source: spec-decompose
related: [../roadmap/project-manager/web-realtime/spec.md, 023-realtime-frontend]
created: 2026-07-27
---

# realtime backend — watcher + WS broadcast (T1·T2·T3)

spec [web-realtime](../roadmap/project-manager/web-realtime/spec.md) T1·T2·T3. 서버측 파이프라인: 파일변경 감지 → WS push.

## 작업
- **T1 CONTRACT** — `ChangeEvent` discriminatedUnion(`{kind:"project",project}` | `{kind:"projects"}`) 추가([ADR-0002·0004]).
- **T2 core-io** — `watchProjects(roots, onChange): dispose`(신규 `watch.ts`, chokidar). 스코프 = 각 프로젝트 `docs/**`·`.cling/profile.md`·`.git/worktrees`·`.claude/worktrees/*/docs/**` + roots 얕은 `*/.cling/profile.md`·`*/*/.cling/profile.md`(추가/삭제). `ignoreInitial`·node_modules/.git objects ignore·`awaitWriteFinish`·debounce 150ms. 변경→`{project}`, profile 추가/삭제→`{projects}`. 경로→프로젝트 slug 매핑([ADR-0003]).
- **T3 backend** — `live.ts`(연결 소켓 레지스트리 add/remove/broadcast) + `server.ts`에서 `@hono/node-ws` `createNodeWebSocket`/`injectWebSocket`, 라우트 `/api/live`, 부팅 시 `watchProjects` 시작 → onChange를 `ChangeEvent`로 broadcast. `{projects}` 시 `clearDiscoverCache()`. `createApp`(HTTP)은 순수 유지.

## acceptance
vitest — T2 temp-dir(변경→onChange project/projects·debounce fake timer·dispose 무발화) · T3 broadcast 레지스트리(mock 소켓 N개 전송·끊긴 소켓 정리, mock watcher→broadcast 배선). tsc 전 패키지. 외부 의존 설치(`chokidar`·`@hono/node-ws`).

## 의존
없음(T1·T2 독립, T3=T1·T2). **실행 준비 완료**(spec이 닫음).
