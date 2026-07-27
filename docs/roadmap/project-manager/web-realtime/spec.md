# spec — web-realtime (phase 2b)

> TBD 제로. blueprint 종속 phase — 공유 seam(Contract·M-0001)은 소비/파생, net-new seam(ChangeEvent)만 add.

## Goal
관리대상 문서·worktree 변경 시 **새로고침 없이 대시보드가 즉시 최신 SoT를 반영**(INV-3 웹 실현). 파일 watcher → WS push → 클라 쿼리 invalidate → 재조회.

## Architecture
```
파일 변경(docs/worktree)  ──chokidar(core-io watchProjects)──▶  onChange({project}|{projects})
       │                                                              │
       │                                                       server.ts: WS 브로드캐스트(@hono/node-ws)
       │                                                              │  ChangeEvent
       └──────────────────────────────────────────────────▶  브라우저 WS(useLiveSync)
                                                                      │
                                                     queryClient.invalidateQueries(predicate: project)
                                                                      │
                                                        기존 endpoint 재조회 → 뷰 최신화
```
- **core-io** `watchProjects(roots, onChange): dispose` — 신규(fs IO 층).
- **backend** server.ts — WS 엔드포인트 `/api/live` + 연결 소켓 레지스트리 + watcher→broadcast 배선. `createApp`(HTTP 라우트)은 순수 유지(테스트용), WS는 server.ts에서 `injectWebSocket`.
- **frontend** `useLiveSync(queryClient)` — WS 연결·재연결 + 메시지→invalidate.
- **contract** `ChangeEvent` — WS 메시지 스키마(net-new seam).

## Invariants (프로파일 해당분 verbatim + 지키는 법)
- **INV-1** — projection은 관리대상 md SoT에서 재생성되는 파생물. 2차 SoT 금지. → WS는 재조회를 *촉발*만, 계산·데이터는 기존 projection 그대로. 클라도 TanStack 캐시가 유일 서버상태(별 스토어 X). **지킴**.
- **INV-2** — gootte는 관리대상 문서 **읽기 전용**. → watcher는 **감시(read)만**, 어떤 write도 없음. 감시 ≠ 쓰기. **지킴**.
- **INV-3** — 뷰는 항상 현재 SoT 반영, stale 뷰 금지. → **이 phase가 웹에서 INV-3를 실현**(watcher push → 자동 재조회). 핵심 목적.
- **INV-4** — read-path 결정적·LLM-free. → WS 메시지 = "바뀜" 신호(project slug)뿐, 해석·요약 없음. watcher→slug 매핑 결정적. **지킴**.

## Scope / Non-goals
- **IN**: chokidar watcher · WS push · 프로젝트 단위 invalidate · 프로젝트 목록 추가/삭제.
- **Non-goal**: .env 로그인(→phase 3) · 웹→서버 제어(관찰 전용; WS 채널만 예약) · fine-grained invalidation · 다중사용자(phase 6).

## Data Model / Contracts
### net-new seam — `ChangeEvent` (contract 추가, T1)
```ts
// @gootte/contract
export const ChangeEvent = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("project"), project: z.string() }), // 그 프로젝트 문서/worktree 변경 → 그 프로젝트 쿼리 invalidate
  z.object({ kind: z.literal("projects") }),                     // 프로젝트 추가/삭제 → projects 쿼리 invalidate(+서버 discover-cache bust)
]);
export type ChangeEvent = z.infer<typeof ChangeEvent>;
```
- **write-owner**: 서버(watcher)가 생산, 클라가 소비. 단일 방향.
- contract mode=codegen이나 코드젠 미배선(직접 import) → src에 직접 add(손편집 아님 = 직접 SoT). blueprint 공유 seam 재등록 X, 이건 이 phase 고유 net-new.

## Reuse map
brief §재사용 map — Hono createApp · TanStack 캐시(invalidate) · discover-cache · core-io IO 층 · per-request 재계산. 재발명 금지.

## Test Strategy (컴포넌트별 verify = tsc + vitest)
- **core-io `watchProjects`**: temp dir fixture — 파일 create/modify/delete → onChange가 올바른 `{project}`(+debounce 뭉침) 발화, 프로젝트 profile 추가/삭제 → `{projects}`, dispose 후 무발화. (fake timer로 debounce.)
- **backend broadcast**: 소켓 레지스트리(add/remove/broadcast) 순수 모듈 단위 — mock 소켓 N개에 ChangeEvent JSON 전송, 끊긴 소켓 정리. watcher→broadcast 배선은 mock watcher로.
- **frontend `useLiveSync`**: mock WebSocket — onmessage(ChangeEvent) → `queryClient.invalidateQueries`가 올바른 predicate(project 매칭)로 호출; onclose→재연결 스케줄; 재연결 open→전체 invalidate.
- **통합(dev)**: 실제 — 문서 편집 → 대시보드 자동 최신화(새로고침 X).

## Operations 영향
- 신규 사용자 명령 **없음** — WS 자동 연결. `pnpm dev` 그대로.
- **vite dev proxy에 `ws: true`** 추가 필요(`/api` WS 업그레이드 프록시) — port-site vite.config.ts 이미 관리, `ws: true` 1줄. (Operations 표 변경 없음.)

## Task Breakdown (DAG)
| T | 컴포넌트 | Files | Consumes/Produces | acceptance | dep |
|---|---|---|---|---|---|
| **T1** | web/contract | `contract/src/index.ts` | produces `ChangeEvent` | zod 스키마 + tsc; discriminatedUnion parse | — |
| **T2** | web/core-io | `core-io/src/watch.ts`(신규)·`index.ts` | produces `watchProjects(roots,onChange):dispose` | vitest temp-dir: 변경→onChange(project/projects)·debounce·dispose | — |
| **T3** | web/backend | `backend/src/live.ts`(신규 broadcast 레지스트리)·`server.ts` | consumes T1·T2 → WS `/api/live` broadcast | vitest broadcast 레지스트리 · 서버 부팅 시 watcher 시작 + 소켓에 ChangeEvent | T1·T2 |
| **T4** | web/frontend | `frontend/src/lib/live.ts`(useLiveSync)·`main.tsx`·`vite.config.ts`(ws:true) | consumes T1 message → invalidate | vitest mock WS: 메시지→invalidate predicate·재연결→전체 invalidate | T1·T3 |

- **granularity → 2 todo**: `022-realtime-backend`(T1+T2+T3, 서버측 파이프라인) · `023-realtime-frontend`(T4, 클라 구독). 023 dep 022(메시지 shape). 한 sprint 번들 가능.

## 외부 의존
- `chokidar`(core-io) · `@hono/node-ws`(backend). 둘 다 설치 필요(T2·T3 착수 시 `pnpm add`).

## 구조 그림
[M-0005](../../mermaid/INDEX.md#M-0005) — 실시간 데이터흐름(M-0002 위 확장).
