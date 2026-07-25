# ADR-0003: 타임라인 좌측 대분류 세로 span 레이아웃 + hover co-highlight

Status: accepted
Date: 2026-07-25 / 관련: spec.md §Task T5, wireframe.md

## Context
타임라인이 sprint/이니셔티브를 평평하게 나열해 "이게 무슨 대분류냐"가 안 보인다(사용자 통증). 그룹핑 렌더 형태를 정해야 한다.

## Decision
**좌측 대분류 세로 span 레이아웃**(가로 헤더 줄 아님):
- 왼쪽 = **대분류 라벨(`label` + `key`) 셀이 그 track 의 행들을 세로로 span**(병합 셀) · `│` 구분 · 오른쪽 = 이니셔티브별 sprint 라인(날짜축 바+마커).
- 그룹 사이 가로 divider(`───┼───`). **미분류(track 없음) = 마지막 그룹**.
- 그룹 순서 = `trackOrder`(profile 선언 순 + vocab 밖 최초등장 순 + 미분류 last) — **결정적**(INV-4).
- **hover co-highlight** — sprint 바(또는 행)에 마우스 → **그 행 + 좌측 대분류 라벨 셀** 동시 배경 변화(같은 그룹 시각 연결). CSS bg(compositor-friendly).

## Alternatives
- **가로 그룹 헤더 줄**(`── C 제어 알고리즘 ──` full-width): 사용자가 명시적으로 "좌측 세로 span" 선택. 기각.
- **행마다 track 칩**(그룹핑 X): "여러 라인을 대분류에 포함" 요구 미충족. 기각(칩은 보드 몫).

## Consequences
- (+) 대분류↔소속 sprint 관계가 좌측 span + hover 로 즉시 파악.
- (−) 세로 span 셀(rowspan 류) 레이아웃 = CSS grid/subgrid 또는 그룹별 flex 블록 필요(커스텀). wireframe 이 형태 고정.
- 보드는 이 레이아웃 미적용(2차원 유지, 칩만) — non-goal.

## Invariant impact
- **INV-2** — 렌더 전용(드래그·편집 X). 준수.
- **INV-4** — 그룹 순서 결정적(trackOrder). 준수.

## Contract impact
- 없음(렌더는 `GanttRow.track` + `TimelineResponse.trackOrder` 소비 — ADR-0001 형상).
