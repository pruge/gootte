---
status: in_progress
sprint: web-viz-finish
priority: normal
initiative: null
area: [web/frontend]
source: spec-decompose
related: [../roadmap/project-manager/web-viz/spec.md, 013-viz-api]
created: 2026-07-25
---

# supersede 그래프 뷰 (T5)

spec T5. [ADR-0001](../roadmap/project-manager/web-viz/adr/0001-custom-rendering-references.md).

- `useLineage`(nodes 추가됨) → **git-graph** 커스텀 SVG 세로 DAG: 노드 스파인 + 엣지(supersede 실선·`supersede-partial` 색 파선·spawn·drop) + ADR 배지. lineage 탭 [체인|그래프] 토글(체인=기존 LineageView).
- **레이아웃 = 순수 함수**(계층/스파인 배치, kind 색) → 단위 테스트. 노드 위치는 프론트 계산(레이아웃), kind는 서버값(INV-4).

**acceptance**: vitest — 레이아웃 함수(노드→좌표) · 그래프 SVG 렌더(mock nodes/edges, partial 색·ADR 배지) · lineage 뷰모드 토글 · tsc. dev 실렌더(jinwooauto 체인).
**의존**: 013 (lineage nodes) · 014 (뷰모드 인프라 패턴)
