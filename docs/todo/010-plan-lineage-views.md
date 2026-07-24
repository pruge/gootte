---
status: pending
priority: high
initiative: null
area: [web/frontend]
source: spec-decompose
related: [../roadmap/project-manager/web-dashboard/spec.md, 009-frontend-scaffold, 011-theme-e2e]
created: 2026-07-25
---

# plan + lineage 뷰 (T4·T5)

spec T4·T5. [wireframe](../roadmap/project-manager/web-dashboard/wireframe.md).

- **T4** plan 뷰 — `/api/plan/:slug` → PlanItem 리스트(▶NOW·①②③·할일·의존) + "왜"(rationale: 방치비용·정지점).
- **T5** lineage 뷰 — `/api/lineage/:slug` → supersede 체인(old→new·ADR 배지·note verbatim·partial 색) + drop(todo→resolvedBy verbatim).

**acceptance**: jinwooauto plan/lineage 렌더 정확 · verbatim(요약 X, INV-4) · vitest(mock query data).
**의존**: 009
