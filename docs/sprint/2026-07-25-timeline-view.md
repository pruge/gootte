---
created: 2026-07-25
status: in_progress
priority: normal
kind: single
todos: [015-timeline-view]
worktree: timeline-view
startedAt: 2026-07-25
related_sprints: [2026-07-25-kanban-board]
---

# timeline-view — CI 워터폴 Gantt (T4)
> 단독. 1 worktree = 1 sprint. 014 뷰모드 인프라 소비 · `/api/timeline` 렌더.

## scope
- 015-timeline-view (normal) — plan 탭 [타임라인] 뷰모드에 CI 워터폴 룩 날짜축 Gantt.

## 🔴 Invariant 점검
- **INV-4** — 바 기간·마커·날짜 bounds는 서버(buildGantt) 값 그대로. 프론트는 날짜→픽셀 **레이아웃(배치)만**, 데이터 재판정 X.
- **INV-1** — `useTimeline` 캐시만.

## 작업 path (예상 phase)
### Phase 1 — 데이터 배선
- `fetchTimeline`·`useTimeline(slug)`(`/api/timeline`) → `TimelineResponse {rows, from, to}`.

### Phase 2 — 날짜→x 스케일 (순수 함수)
- `dateToX(date, from, to, width)` 등 순수 스케일 함수 → 단위 테스트. 날짜(YYYY-MM-DD) 파싱·정규화.

### Phase 3 — 워터폴 SVG
- 행=이니셔티브 · 바=sprint 기간(start→end, kind 색) · 마커=kickoff(●)/re-kickoff(▲) · x축=날짜 눈금(from~to). 커스텀 SVG/CSS(라이브러리 X, ADR-0001).
- 빈 상태(바·행 0) 처리. MainPanel의 타임라인 플레이스홀더 → TimelineView 교체.

## 다음 단계 결정 필요
- 없음(spec·012가 닫음). 마커 희소 정상(W1).

## 완료 기준
- 015 완료: vitest — 날짜→x 스케일 함수 · 타임라인 렌더(mock TimelineResponse, 바·마커 위치) · tsc. dev에서 jinwooauto 타임라인 실렌더(47행 07-05~07-24).
- 전체 회귀: `pnpm verify`(63+) green.

## 사용자 테스트
> sprint `timeline-view` 완료 기준 전체 (이번 turn 변경 아니라 sprint 전체 회귀). 자동 게이트(`pnpm verify` 78 tests + `mermaid-refs-check`)는 머지 전 실행 완료.

🌐 Frontend + Backend dev (user-runs)
```
pnpm dev
```

✅ 테스트
- plan 탭 → **[타임라인]** 뷰모드 = 이니셔티브별 가로 sprint 바 + 날짜축(MM-DD 눈금) 렌더
- 각 행에 kickoff(● accent)·재-kickoff(▲ amber) 마커가 날짜 위치에 표시, 상단 범례와 일치
- jinwooauto 선택 시 07-05~07-24 범위로 바·마커 배치(실데이터)
- 날짜 있는 sprint·kickoff 없는 프로젝트 = "타임라인을 그릴 수 없습니다" 빈 상태
- 창 폭 줄여도 % 기반이라 바/눈금이 반응형으로 재배치(overflow 없음)

## 관련 todo / spec
- [015-timeline-view](../todo/015-timeline-view.md) — 타임라인 Gantt (T4)
- [spec](../roadmap/project-manager/web-viz/spec.md) · [ADR-0001 커스텀렌더](../roadmap/project-manager/web-viz/adr/0001-custom-rendering-references.md) · [wireframe](../roadmap/project-manager/web-viz/wireframe.md) · [M-0003](../mermaid/INDEX.md#M-0003)
