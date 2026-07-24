---
status: done
sprint: kanban-board
completedAt: 2026-07-25
priority: high
initiative: null
area: [web/frontend]
source: spec-decompose
related: [../roadmap/project-manager/web-viz/spec.md, 013-viz-api, 015-timeline-view]
created: 2026-07-25
---

# 뷰모드 인프라 + 칸반 보드 (T3)

spec T3. [ADR-0002](../roadmap/project-manager/web-viz/adr/0002-viewmode-tab-structure.md) · [ADR-0001](../roadmap/project-manager/web-viz/adr/0001-custom-rendering-references.md).

- **뷰모드 인프라** — `useUrlState` 확장(`?view=<mode>`) · plan 탭에 [리스트|보드|타임라인] 토글(Tabs 패턴 재사용). 리스트=기존 PlanView.
- **칸반 보드** — `useBoard(slug)`(`/api/board`) → **Linear 룩** 커스텀 CSS grid: 3컬럼(active/ready/blocked)+count 배지, 카드=PlanItem(NOW·status·priority chip·할일수·deps, blocked=미충족 dep 강조). Tabler 전용.

**acceptance**: vitest — 보드 3컬럼·카드 렌더(mock BoardResponse) · 뷰모드 URL 토글 · tsc. dev에서 실렌더.
**의존**: 013
