---
status: in_progress
priority: normal
sprint: plan-roadmap-checklist
initiative: null
area: [web/core, web/contract, web/backend, web/frontend]
source: user-request
related: [../roadmap/project-manager/web-viz/spec.md, 021-track-plan-board]
created: 2026-07-27
---

# plan 리스트 v2 — roadmap 목록 + 할일 체크리스트 드릴다운

> 리셋 후 첫 초점(하나만). plan **리스트**만(보드·타임라인은 별개). lineage 보류.

## 목적
plan 리스트에서 **각 roadmap 이니셔티브(완료+예정+진행)** 를 대분류(track)별로 보여주고, **클릭하면 그 이니셔티브의 할일 체크리스트(한일 ☑ / 남은일 ☐)** 를 펼쳐 "뭐가 끝났고 뭐가 남았나"를 한눈에.

## 설계 결정 (확정)
- **완료 이니셔티브 포함**(Q2=ⓐ) — 지금 buildPlan은 actionable(active/ready/blocked)만 → **완료(shipped) 포함 전체 roadmap 목록**으로. 상태 배지(✅/🔜/⬜)로 구분, 진행·예정 먼저 → 완료 뒤. track 그룹(021 재사용).
- **체크리스트 = todos 재구성**(Q1=ⓐ) — 그 이니셔티브의 todos를 done=☑ / pending=☐. SoT=todo frontmatter(INV-1), ledger md 파싱 X. gootte가 이미 `initiative.todos`(archive된 done 포함) 보유. 표시=todo slug + 상태.

## 작업 (예상)
- **CORE**: 신규 projection `buildRoadmap(state)` — 전 이니셔티브(완료 포함) → `{slug, track(정규화), status, done:[todoSlug], pending:[todoSlug]}`, trackOrder 순 그룹. (partition의 SHIPPED 필터 없이 전체. done todo = archive 포함 `initiative.todos` 중 status done.)
- **CONTRACT**: `RoadmapItem{initiative, track, status, done[], pending[]}` + `RoadmapResponse{project, items, trackOrder}`. (또는 PlanResponse 확장 — seam 최소.)
- **backend**: `/api/roadmap/:slug` (또는 plan 확장).
- **frontend**: 리스트 뷰 = track 그룹 + 항목(상태 배지) + **클릭 시 펼쳐 체크리스트**(useState 확장, 한일/남은 카운트). `usePlan` 자리 재사용.

## acceptance
vitest — buildRoadmap(완료 포함·done/pending 분리·trackOrder 순) · 체크리스트 렌더(mock, 한일☑/남은☐) · 클릭 펼침 토글 · app.test /api/roadmap. tsc. dev 실렌더(jinwooauto — 완료 이니셔티브 클릭 → 할일 done/남은).

## 의존
없음(state·todos 이미 있음). 021(track 그룹) 재사용.
