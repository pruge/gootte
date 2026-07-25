---
status: done
completedAt: 2026-07-26
sprint: track-timeline-grouped
priority: normal
initiative: null
area: [web/frontend]
source: spec-decompose
related: [../roadmap/project-manager/track-grouping/spec.md, 019-track-projection-api]
created: 2026-07-25
---

# track: 타임라인 그룹 레이아웃 + hover co-highlight (T5)

spec T5. [ADR-0003](../roadmap/project-manager/track-grouping/adr/0003-timeline-grouped-layout.md)·[wireframe](../roadmap/project-manager/track-grouping/wireframe.md).

- `TimelineChart`(+ `TimelineView` trackOrder 소비) — **좌측 대분류 라벨(label+key) 세로 span + `│` divider + 그 track 의 sprint 라인들**. 그룹 순서 = trackOrder(미분류 그룹 last).
- **hover co-highlight** — sprint 바(또는 행)에 마우스 → 그 행 + 좌측 대분류 라벨 셀 동시 배경 변화(CSS bg, compositor-friendly).

**acceptance**: vitest — 그룹 헤더/행 렌더(mock TimelineResponse trackOrder+track), hover class 토글(그룹+행 동시), 미분류 그룹 last. tsc. dev 실렌더(jinwooauto track별 그룹).
**의존**: 019.
