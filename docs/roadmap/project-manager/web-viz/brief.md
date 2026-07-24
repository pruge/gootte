# brief — web-viz (project-manager 2c)

> blueprint 종속 phase. 전체·seam·불변식 = [../blueprint.md](../blueprint.md). 2a([web-dashboard](../web-dashboard/)) 위에 시각화 레이어.

## 문제 / 의도
2a는 plan·lineage를 **텍스트 리스트/체인**으로 렌더. 사용자의 원래 비전 = **"칸반·달력으로 한눈에"**. 같은 CORE projection을 **시각화**(칸반 보드·시간축·supersede 그래프·worktree 상태)로 확장해 사람이 "현재/왜/다음"을 한눈에 파악.

## scope (blueprint 2c 소비)
- **칸반 보드** — active/ready/blocked 파티션(buildPlan 버킷) 컬럼 + 카드.
- **타임라인(Gantt)** — sprint 기간 + kickoff 이벤트를 **날짜축** 가로 막대(CI 워터폴 룩). (worktree 라이브는 패널; hour-level은 future.)
- **supersede 그래프** — `state.lineage`(nodes/edges)를 git-graph 세로 DAG로.
- **worktree/test 패널** — 활성 worktree 상태 + conflictRisk(GitSignal) + 검토할 것.

## 라이프사이클
2a 셸에 뷰 얹기 → 사용자가 프로젝트 선택 → plan 탭(리스트/보드/타임라인 토글) · lineage 탭(체인/그래프 토글) · worktree 탭. read-only.

## 재사용 map (재발명 금지)
- **CORE**: `buildPlan`의 3-파티션 버킷 로직 → `buildKanban`과 공유(추출). `state.lineage`(nodes/edges) → 그래프 그대로. `GitSignal`·`Worktree`·`Sprint`(startedAt/endedAt)·`KickoffEvent.at` → 타임라인·worktree 패널.
- **CONTRACT**: `PlanItem`(칸반 카드로 재사용)·`LineageNode/Edge`(그래프)·`GitSignal`·`Worktree`. **신규 = `KanbanColumn`·`GanttRow/Bar/Marker` + envelope**.
- **프론트**: 009/010 셸(사이드바·탭·theme·TanStack Query·api client) → 뷰모드·뷰 컴포넌트만 추가.

## 렌더링 결정 (레퍼런스 = 커스텀 재현)
| 시각화 | 타겟 레퍼런스 | 구현 |
|---|---|---|
| 칸반 | **Linear 보드** | 커스텀 CSS grid |
| 타임라인 | **CI 워터폴 룩 / GitHub Projects roadmap**(날짜축) | 커스텀 SVG/CSS |
| 그래프 | **git 커밋 그래프**(GitKraken·`git log --graph`) | 커스텀 SVG 세로 DAG |
| worktree 패널 | **GitHub PR checks / Vercel deploys** | 커스텀 카드 |
- **라이브러리 미사용**(reactflow 등) — anti-template(force graph 슬롭 회피) + 번들 예산 + lineage=대부분 체인이라 force 과함. 진짜 대규모 그래프 상호작용 필요 시 후속 확장(YAGNI).

## UX 구조
데이터 탭(plan/lineage) + **뷰모드 토글**: plan → [리스트|보드|타임라인], lineage → [체인|그래프]. worktree = 별 탭. URL `?p=&tab=&view=`(공유가능).

## non-goal (2c)
- 실시간 push(2b) · auth(2b) · 멀티머신(6) · 드래그로 상태 변경(read-only, INV-2) · 대규모 force 그래프 상호작용(pan/zoom 라이브러리).

## future
- 2b 합류 시 뷰가 WS invalidate로 live. 대규모 그래프 필요 시 라이브러리 도입 재검토.

## ADR 색인
- [ADR-0001](adr/0001-custom-rendering-references.md) — 커스텀 렌더링 + 레퍼런스 타겟
- [ADR-0002](adr/0002-viewmode-tab-structure.md) — 데이터 탭 + 뷰모드 토글 UX
- [ADR-0003](adr/0003-core-projection-boundary.md) — CORE projection 경계(buildKanban/buildGantt, 버킷 공유, 그래프 재사용)
- [ADR-0004](adr/0004-worktree-panel-scope.md) — worktree/test 패널 범위(구조적, 프로즈 파싱 X)
