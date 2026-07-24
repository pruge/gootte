# ADR-0003: CORE projection 경계 (buildKanban/buildGantt, 버킷 공유, 그래프 재사용)

Status: accepted
Date: 2026-07-25 / 관련: spec.md §Data Model, §Reuse map

## Context
칸반/Gantt/그래프 데이터를 어디서 계산하나 — CORE projection(결정적) vs 프론트 파생. INV-4는 read-path를 CORE 결정적으로 요구.

## Decision
- **버킷/순서/kind/기간 = CORE**(결정적, 테스트 가능). 프론트는 그 값으로 **픽셀 레이아웃만**.
- **`partitionInitiatives(state, gitSignals)` 추출** — buildPlan의 3-분할(active/ready/blocked) 로직을 함수로 뽑아 `buildPlan`(순서)와 `buildKanban`(컬럼)이 **공유**(DRY, 로직 1벌). **buildPlan 회귀 = indexOrder tiebreak 보존**(N1).
- **`buildKanban(state, gitSignals)`** → `KanbanColumn[]`(각 컬럼 `PlanItem[]` 재사용).
- **`buildGantt(state)`** → `GanttRow[]`(이니셔티브별) — **바 = `Sprint`(startedAt→endedAt, 날짜)만**(B1: Worktree는 날짜 소스 없음 = `git worktree list` 현재 목록뿐 → Gantt 바 X, 라이브 상태는 017 패널). 마커 = `KickoffEvent.at`(희소 가능). **날짜 bounds(from/to)**.
- **그래프 = `state.lineage`(nodes/edges) 재사용** — 신규 projection 없음. `LineageResponse`에 `nodes` 추가만.
- **`parseSprint` 날짜 파싱** — Gantt 바 기간 소스(frontmatter created/startedAt/endedAt).

## Alternatives
- 프론트가 plan/lineage에서 버킷·kind 재파생 → 로직 2벌(CORE+프론트) desync·INV-4 위배. 기각.
- 버킷 로직을 buildKanban에 복제 → buildPlan과 2벌. 기각(추출 공유).

## Consequences
- (+) 결정적·단위테스트 가능 · 프론트 얇음 · 2b WS가 재계산에 자연 확장.
- (+) 버킷 로직 1벌(추출) — buildPlan/buildKanban 일관.
- (−) Sprint 날짜 없는 레거시 프로젝트는 Gantt 희소(빈 상태 처리).

## Invariant impact
**INV-4** — 판정(버킷·순서·kind·기간)은 CORE 결정적. 프론트는 레이아웃(픽셀)만, 데이터 재판정 X. **INV-1** — projection은 md SoT 파생.

## Contract impact
신규 `KanbanColumn`·`GanttRow/Bar/Marker`·`WorktreeStatus` + envelope 3종. 확장 `Sprint`(날짜)·`LineageResponse`(nodes). CORE가 유일 write.
