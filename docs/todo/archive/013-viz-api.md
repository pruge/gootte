---
status: done
sprint: viz-api
completedAt: 2026-07-25
priority: high
initiative: null
area: [web/backend]
source: spec-decompose
related: [../roadmap/project-manager/web-viz/spec.md, 012-viz-data-model, 014-kanban-board]
created: 2026-07-25
---

# viz backend endpoint (T2)

spec T2. [ADR-0003](../roadmap/project-manager/web-viz/adr/0003-core-projection-boundary.md).

- `code/web/backend/**` — 신규 라우트(CONTRACT envelope zod 검증, INV-4 릴레이):
  - `GET /api/board/:slug` → `BoardResponse` (buildKanban)
  - `GET /api/timeline/:slug` → `TimelineResponse` (buildGantt)
  - `GET /api/worktree/:slug` → `WorktreeResponse` (loadProjectState worktrees + gitSignals, [ADR-0004](../roadmap/project-manager/web-viz/adr/0004-worktree-panel-scope.md))
  - `GET /api/lineage/:slug` → `LineageResponse`에 **nodes 추가**(그래프용).
- slug 해소·404 = 기존 패턴 재사용.

**acceptance**: `app.request` vitest — 3 신규 endpoint envelope zod 검증 + lineage nodes + 404. 픽스처(alpha) + jinwooauto 스모크.
**의존**: 012
