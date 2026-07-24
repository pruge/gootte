---
status: in_sprint
sprint: backend-api
priority: high
initiative: null
area: [web/backend]
source: spec-decompose
related: [../roadmap/project-manager/web-dashboard/spec.md, 009-frontend-scaffold, 010-plan-lineage-views, 011-theme-e2e]
created: 2026-07-25
---

# backend Hono API (T1)

spec [Task Breakdown](../roadmap/project-manager/web-dashboard/spec.md#task-breakdown) T1.

- **CONTRACT 먼저** — `@gootte/contract`에 API envelope 4종 추가(kickoff-review B1): `ProjectsResponse`·`PlanResponse`·`LineageResponse`·`ApiError`. backend 생산·frontend 소비 공유 SoT.
- `code/web/backend/**` — Hono + `@hono/node-server` + `@hono/zod-validator`.
  - `GET /api/projects` → `ProjectsResponse` (core-io discover, env `GOOTTE_ROOTS`)
  - `GET /api/plan/:slug` → `PlanResponse` (loadProjectState→buildPlan)
  - `GET /api/lineage/:slug` → `LineageResponse` (state)
  - 응답 = CONTRACT zod 검증. LLM 0(INV-4). 정적 frontend 빌드 서빙(프로덕션).
  - **slug→path 해소**(W1) — discover 결과 basename lookup. 충돌 시 first-match + `console.warn`. 미해소=404 `ApiError`.
  - **discover 캐시**(W2) — 머신 스캔은 프로세스 메모리 캐시(TTL 5s). plan/lineage의 loadProjectState는 매 요청 재계산(INV-3).

**acceptance**: `app.request('/api/...')` vitest — envelope zod 검증(CONTRACT)·404 `ApiError`·slug 충돌 경고·캐시 재사용. `@gootte/core`·`core-io` 소비.
**의존**: — (spec 이 닫음)
