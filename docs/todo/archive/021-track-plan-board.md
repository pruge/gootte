---
status: done
completedAt: 2026-07-26
sprint: track-plan-board
priority: normal
initiative: null
area: [web/frontend]
source: spec-decompose
related: [../roadmap/project-manager/track-grouping/spec.md, 019-track-projection-api]
created: 2026-07-25
---

# track: 리스트 섹션 헤더 + 보드 track 칩 (T6)

spec T6. [wireframe](../roadmap/project-manager/track-grouping/wireframe.md).

- **리스트(plan)** `PlanView` — track 섹션 헤더(`key · label`)로 항목 묶음, 순서 = trackOrder(미분류 last), 전역 order 유지.
- **보드** `BoardCard` — 정규화 track 칩(`{key} {label}`)으로 기존 원문 track 렌더 대체. 상태 3컬럼은 그대로(2차원 유지, non-goal=스윔레인 재편).

**acceptance**: vitest — 리스트 track 헤더 그룹핑(mock trackOrder) · 보드 카드 정규화 track 칩(원문 아님). tsc.
**의존**: 019. (020 과 병렬 가능 — 둘 다 T4 소비.)
