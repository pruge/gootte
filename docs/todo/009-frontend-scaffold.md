---
status: pending
priority: high
initiative: null
area: [web/frontend]
source: spec-decompose
related: [../roadmap/project-manager/web-dashboard/spec.md, 008-backend-api, 010-plan-lineage-views]
created: 2026-07-25
---

# frontend scaffold + 사이드바/라우팅 (T2·T3)

spec T2·T3.

- **T2** `code/web/frontend/**` — Vite+React+Tailwind(+Tabler·Pretendard)+TanStack Query+**theme 3-mode** context 부팅.
- **T3** `code/web/frontend/src/**` — 사이드바(`/api/projects` → 목록, Tabler 아이콘) + URL state(`?p=<slug>&tab=plan|lineage`) 라우팅. **경량 `URLSearchParams`+훅 — react-router 불필요**(단일 페이지, search-param만)(N1).

**acceptance**: tsc + `pnpm dev` 부팅 · `/api/projects` → `ProjectsResponse` 목록 렌더 · URL 선택/탭 동작 · vitest(사이드바·theme 토글).
**의존**: 008 (API), 병렬 가능한 scaffold 부분 먼저.
