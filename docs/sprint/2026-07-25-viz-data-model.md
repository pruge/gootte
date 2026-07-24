---
created: 2026-07-25
status: in_progress
priority: high
kind: single
todos: [012-viz-data-model]
worktree: viz-data-model
startedAt: 2026-07-25
related_sprints: [2026-07-25-theme-e2e]
---

# viz-data-model — CONTRACT 타입 + CORE projection (T1)
> 단독. 1 worktree = 1 sprint. 2c 시각화 데이터 dep 루트(013~017 전부 소비).

## scope
- 012-viz-data-model (high) — CONTRACT viz 타입 + CORE projection(partition 추출·buildKanban·buildGantt·parseSprint 날짜).

## 🔴 Invariant 점검
- **INV-4** 결정적·LLM-free — 버킷 분류·순서·바 기간 = CORE 순수 계산(테스트 가능). LLM 0.
- **INV-1** projection 파생 — md SoT에서 재생성. 2차 SoT 없음.
- **INV-2** 무관(read 계산만).

## 작업 path (예상 phase)
### Phase 1 — CONTRACT (contract 순수 SoT)
- `@gootte/contract`: `KanbanColumn`·`GanttBar`(kind:"sprint")·`GanttMarker`·`GanttRow`·`WorktreeStatus` + envelope `BoardResponse`·`TimelineResponse`·`WorktreeResponse`.
- 확장: `Sprint`(+created?/startedAt?/endedAt?) · `LineageResponse`(+nodes: LineageNode[]).

### Phase 2 — partition 추출 (DRY)
- `partitionInitiatives(state, gitSignals)` → {active, ready, blocked} — buildPlan 인라인 로직 추출. **buildPlan이 이걸 소비하게 리팩터, 순서(indexOrder tiebreak) 회귀 보존**.

### Phase 3 — projection
- `buildKanban(state, gitSignals)` → `KanbanColumn[]`(컬럼별 PlanItem[]).
- `buildGantt(state)` → `GanttRow[]` — 바 = **sprint startedAt→endedAt만**(날짜) · 마커 = KickoffEvent.at(희소 가능) · 날짜 from/to bounds.
- `parseSprint` 날짜 파싱(frontmatter created/startedAt/endedAt).

## 다음 단계 결정 필요
- 없음(spec이 닫음). B1(worktree 바 없음)·B2(날짜축)·N1(indexOrder 보존)은 리뷰 반영됨.

## 완료 기준
- 012 완료: vitest — `partitionInitiatives`(3버킷 정확 + **buildPlan 순서 회귀 유지**) · `buildKanban`(컬럼·카드) · `buildGantt`(sprint 바 기간·마커·날짜 bounds, 날짜 다양한 fixture) · `parseSprint`(날짜). tsc green.
- 전체 회귀: `pnpm verify`(기존 47 + 신규) green.

## 사용자 테스트
> CORE projection + CONTRACT 타입 — **사용자 가시 테스트 없음**(dev 서버·UI 무변경). 가시화는 013 API/014 뷰.
> 자동 게이트: `pnpm verify` 54/54 green(viz 7 신규 + buildPlan 회귀). jinwooauto 실데이터 스모크: kanban active0/ready15/blocked0 · gantt 47행(07-05~07-24, 바 47·마커 0=events 없음 W1).

## 관련 todo / spec
- [012-viz-data-model](../todo/012-viz-data-model.md) — CONTRACT + CORE projection (T1)
- [spec](../roadmap/project-manager/web-viz/spec.md) · [ADR-0003 projection경계](../roadmap/project-manager/web-viz/adr/0003-core-projection-boundary.md) · [M-0003](../mermaid/INDEX.md#M-0003)
