---
status: pending
priority: high
initiative: null
area: [web/contract, web/core]
source: spec-decompose
related: [../roadmap/project-manager/web-viz/spec.md, 013-viz-api]
created: 2026-07-25
---

# viz 데이터 모델 + CORE projection (T1)

spec [Task](../roadmap/project-manager/web-viz/spec.md#task-breakdown) T1. [ADR-0003](../roadmap/project-manager/web-viz/adr/0003-core-projection-boundary.md).

- **CONTRACT** — `KanbanColumn`·`GanttBar`·`GanttMarker`·`GanttRow`·`WorktreeStatus` + envelope `BoardResponse`·`TimelineResponse`·`WorktreeResponse`. 확장: `Sprint`(+`created?`·`startedAt?`·`endedAt?`) · `LineageResponse`(+`nodes: LineageNode[]`).
- **CORE** — `partitionInitiatives(state, gitSignals)` **buildPlan에서 추출**(active/ready/blocked, 로직 공유·DRY) → buildPlan도 이걸 소비하게 리팩터(**indexOrder tiebreak 보존**, N1). `buildKanban(state, gitSignals)` → columns(PlanItem 재사용). `buildGantt(state)` → rows/**바(sprint startedAt→endedAt만, 날짜)**/markers(KickoffEvent.at, 희소 가능) + 날짜 from/to bounds. (worktree 바 없음 — B1.)
- **parseSprint** — frontmatter 날짜(created/startedAt/endedAt) 파싱해 Sprint에.

**acceptance**: vitest — `partitionInitiatives`(3버킷 정확 + **buildPlan 순서 회귀**) · `buildKanban`(컬럼·카드) · `buildGantt`(sprint 바 기간·마커·날짜 bounds) · `parseSprint`(날짜). tsc green.
**의존**: — (spec 이 닫음)
