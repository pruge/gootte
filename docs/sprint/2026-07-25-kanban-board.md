---
created: 2026-07-25
status: in_progress
priority: high
kind: single
todos: [014-kanban-board]
worktree: kanban-board
startedAt: 2026-07-25
related_sprints: [2026-07-25-viz-api]
---

# kanban-board — 뷰모드 인프라 + Linear 룩 보드 (T3)
> 단독. 1 worktree = 1 sprint. `/api/board` 소비 · 뷰모드 인프라는 015/016 dep 루트.

## scope
- 014-kanban-board (high) — 뷰모드 토글 인프라(`?view=`) + plan 탭 [리스트|보드|타임라인] 토글 + Linear 룩 칸반 보드.

## 🔴 Invariant 점검
- **INV-1** — 서버상태 = TanStack Query 캐시(`useBoard`). 별 스토어 X.
- **INV-4** — 버킷 분류·순서는 서버(buildKanban)값 그대로 렌더. 프론트 재판정 X.

## 작업 path (예상 phase)
### Phase 1 — 뷰모드 인프라 (015/016 재사용)
- `useUrlState` 확장 — `?view=<mode>` (탭별 유효 모드: plan→list/board/timeline, lineage→chain/graph). 기본값 = 리스트/체인.
- plan 탭에 뷰모드 토글(기존 Tabs 패턴 재사용, ADR-0002). 리스트=기존 PlanView.

### Phase 2 — 칸반 보드
- `useBoard(slug)`(`/api/board`, TanStack Query) → `KanbanColumn[]`.
- **Linear 룩** 커스텀 CSS grid: 3컬럼(active/ready/blocked) + count 배지 · 카드 = PlanItem(NOW·status chip·priority·할일수·deps, blocked=미충족 dep 강조). Tabler 아이콘·Pretendard.

## 다음 단계 결정 필요
- 없음(spec·wireframe이 닫음).

## 완료 기준
- 014 완료: vitest — 보드 3컬럼·카드 렌더(mock BoardResponse) · 뷰모드 URL 토글(?view=board) · tsc. dev에서 jinwooauto 보드 실렌더(ready 15).
- 전체 회귀: `pnpm verify`(58+) green.

## 사용자 테스트
> `/cling:worktree` 개발 완료 보고 시 채움.

## 관련 todo / spec
- [014-kanban-board](../todo/014-kanban-board.md) — 뷰모드 인프라 + 칸반 (T3)
- [spec](../roadmap/project-manager/web-viz/spec.md) · [ADR-0002 뷰모드](../roadmap/project-manager/web-viz/adr/0002-viewmode-tab-structure.md) · [wireframe](../roadmap/project-manager/web-viz/wireframe.md) · [M-0003](../mermaid/INDEX.md#M-0003)
