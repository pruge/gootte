# spec — web-dashboard · phase 2a 웹 셸 (TBD 제로)

> blueprint 종속. 전체·seam·불변식 = [../blueprint.md](../blueprint.md). 구조 = [M-0002](../../../mermaid/INDEX.md#M-0002)(2a 데이터흐름, sources: M-0001). 레이아웃 = [wireframe.md](wireframe.md).

## Goal
로컬 웹 대시보드 — 자동발견한 cling 프로젝트 목록 → 선택 → **plan(순서+왜) · lineage(supersede 체인+drop)** 를 React로 렌더. backend(Hono)는 CORE projections를 CONTRACT zod로 검증해 JSON 서빙. **CORE→HTTP→React 파이프라인 확립**(2b/2c가 얹힘).

## Architecture (blueprint 소비) → [M-0002]
```
core-io.loadProjectState → core.buildPlan/lineage → Hono API(zod) → TanStack Query → React 뷰
```
backend = CORE 릴레이(계산 0, LLM 0 = INV-4). frontend = 렌더.

## Components (신규)
| 컴포넌트 | 경로 | 내용 |
|---|---|---|
| `web/backend` | `code/web/backend/` | Hono 서버 — API 라우트(zod 검증) + 정적 frontend 서빙. `@gootte/core`·`core-io` 소비 |
| `web/frontend` | `code/web/frontend/` | Vite+React+Tailwind(Tabler·Pretendard)+TanStack Query+theme. plan/lineage 뷰 |

## Invariants (프로파일 verbatim)
- **INV-1** projection 재생성 파생 — frontend는 서버상태 복제 X(TanStack Query 캐시만, Zustand 미사용).
- **INV-2** 관리대상 읽기 전용 — backend는 loadProjectState(read)만. write 없음.
- **INV-4** read-path 결정적·LLM-free — backend는 CORE 릴레이(서버 LLM 0). 렌더는 verbatim.
- INV-3 항상 현재 반영 — 2a=요청 시 재계산(fetch마다 loadProjectState). watcher push=2b.

## Scope / Non-goals
- **scope**: Hono API(projects/plan/lineage) + React(사이드바·plan뷰·lineage뷰) + theme 3-mode. localhost.
- **non-goal**: WS/watcher·auth(2b) · 칸반/Gantt/시각그래프(2c) · 터널/Android(3차).

## Data Model / Contracts (blueprint seam 소비 — 재정의 X)
API req/resp = CONTRACT 타입. 도메인 타입(`Project`·`PlanItem`·`Supersession`·`DropRecord`)은 소비, **envelope도 CONTRACT에 정의**(cross-boundary seam — kickoff-review B1):
```
GET /api/projects            → ProjectsResponse  { projects: Project[] }
GET /api/plan/:slug          → PlanResponse      { project, plan: PlanItem[], rationale: PlanRationale[] }
GET /api/lineage/:slug       → LineageResponse   { project, edges: LineageEdge[], drops: DropRecord[] }
(에러)                        → ApiError          { error }
```
- **envelope 4종(`ProjectsResponse`·`PlanResponse`·`LineageResponse`·`ApiError`) = `@gootte/contract`에 신규**. backend 생산·frontend 소비가 같은 SoT import → 재선언 0. (T1에서 contract 추가 후 소비.)
- **lineage = `edges: LineageEdge[]`**(not raw Supersession) — CORE가 `kind`(supersede/partial/reference)를 결정적으로 해소해 보냄. frontend는 partial 색·ADR 배지를 kind/adr로 렌더만, 재계산 X(INV-4 — 해소는 CORE). (as-built 정제, T1.)
- **API 응답 = `@hono/zod-validator`로 이 CONTRACT 스키마 검증** 후 반환(INV-4 보증 — 릴레이 형상 고정).
- **slug→path 해소** — discover 결과에서 `slug`(=디렉토리 basename)로 lookup. **충돌 규칙**: 같은 basename 프로젝트 2개↑면 first-match(discover 순서) + `console.warn`으로 모호 경고(2a=localhost 단일 사용자라 허용). path 기반 고유 id는 2b 강화(W1).
- 없으면 404 `ApiError { error }`.
- **discover 캐시(W2)** — discover는 머신 스캔이라 매 요청 재실행 금지: 프로세스 메모리에 `Project[]` 캐시(짧은 TTL, 기본 5s). `/api/projects`·slug 해소 모두 캐시 사용. **단 `/api/plan`·`/api/lineage`의 loadProjectState(파싱·계산)는 매 요청 재계산 = INV-3**(프로젝트 목록은 자주 안 변하니 캐시 안전, 내용은 항상 최신).
- discover 루트 = env `GOOTTE_ROOTS`(기본 `~/Documents`) — 서버 설정.

## Reuse map
CORE `loadProjectState`·`buildPlan`·state.supersessions/drops = 데이터소스. CONTRACT = req/resp SoT. 새 계산 0.

## Test Strategy
- `web/backend`: **vitest** — 라우트 핸들러(loadProjectState mock/fixture proj → JSON envelope·zod 검증·404). Hono `app.request()` 테스트.
- `web/frontend`: **vitest + @testing-library/react** — 뷰 컴포넌트 렌더(plan 리스트·lineage 체인, mock query data) + theme 토글. 시각회귀는 2c.
- verify: `tsc --noEmit` + vitest. dev 서버는 수동/e2e.

## Operations 영향
- **신규 dev 서버** — backend(`hono` node) + frontend(`vite`). → 프로파일 `## Ports` 추가(main 밴드 backend 8800대/frontend 5300대) + `## Worktree bootstrap`(node_modules) 필요. **`/cling:ops` 재실행**으로 `pnpm dev:backend`·`dev:frontend`(who=user-runs) + 포트 배정.
- 루트 명령: `pnpm dev`(둘 다) 추가.

## Task Breakdown
| T | 내용 | Files | acceptance | dep |
|---|---|---|---|---|
| **T1** | backend Hono API | `code/web/backend/**` | `/api/{projects,plan,lineage}` zod 검증 JSON · vitest `app.request` green | — |
| **T2** | frontend scaffold | `code/web/frontend/**` | Vite+React+Tailwind(Tabler·Pretendard)+TanStack Query+**theme 3-mode** 부팅 · tsc | — |
| **T3** | 사이드바 + 라우팅 | `code/web/frontend/src/**` | `/api/projects` → 프로젝트 목록 · URL state(`?p=<slug>&tab=plan\|lineage`, **경량 `URLSearchParams`+훅 — react-router 불필요**) · vitest | T1,T2 |
| **T4** | plan 뷰 | `code/web/frontend/src/**` | PlanItem 리스트(NOW·할일·deps) + rationale(왜·방치비용) 렌더 · vitest | T3 |
| **T5** | lineage 뷰 | `code/web/frontend/src/**` | supersede 체인 + drop 렌더(verbatim) · vitest | T3 |
| **T6** | theme 토글 + 디자인 polish | `code/web/frontend/src/**` | **측정(vitest/자동)**: system/dark/light 3-mode 순환 토글 · localStorage 지속 · CSS 토큰 적용 · hover/focus 상태 존재. **사람 eye-check(비자동)**: 다크 미션컨트롤/라이트 에디토리얼 둘 다 의도적(anti-template) — T7 렌더 시 육안 확인 | T4,T5 |
| **T7** | e2e (backend+frontend on jinwooauto) | (dev 서버) | `pnpm dev` → 브라우저에서 jinwooauto plan/lineage 렌더 확인 | T6 |

**DAG:** `{T1, T2}` · `{T1,T2}→T3→{T4,T5}→T6→T7`

## 외부 의존
`hono` · `@hono/node-server` · `@hono/zod-validator` · `react`·`react-dom` · `vite`·`@vitejs/plugin-react` · `@tanstack/react-query` · `tailwindcss` · `@tabler/icons-react` · Pretendard(웹폰트) · `@testing-library/react`.
