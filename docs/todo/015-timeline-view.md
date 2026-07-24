---
status: pending
priority: normal
initiative: null
area: [web/frontend]
source: spec-decompose
related: [../roadmap/project-manager/web-viz/spec.md, 014-kanban-board]
created: 2026-07-25
---

# 타임라인(Gantt) 뷰 (T4)

spec T4. [ADR-0001](../roadmap/project-manager/web-viz/adr/0001-custom-rendering-references.md).

- `useTimeline(slug)`(`/api/timeline`) → **CI 워터폴 룩** 커스텀 SVG/CSS: 행=이니셔티브 · 바=**sprint 기간**(startedAt→endedAt) · 마커=kickoff(●)/re-kickoff(▲, **희소 정상** W1) · x축=**날짜 눈금**(날짜 from/to bounds). plan 탭 [타임라인] 뷰모드.
- **바 위치 계산** = 순수 함수(**날짜→픽셀 스케일**) → 단위 테스트.
- 날짜 없는 이니셔티브 = 행 생략/빈 상태.

**acceptance**: vitest — 바 위치 계산(날짜→x) 함수 · 타임라인 렌더(mock TimelineResponse, **날짜 다양한** 바·마커 W2) · tsc. dev 실렌더.
**의존**: 014 (뷰모드 인프라)
