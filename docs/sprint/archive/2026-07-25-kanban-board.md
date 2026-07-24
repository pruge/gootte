---
created: 2026-07-25
status: done
priority: high
kind: single
todos: [014-kanban-board]
worktree: kanban-board
startedAt: 2026-07-25
endedAt: 2026-07-25
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
> sprint kanban-board 완료 기준 — worktree 안 검토용. (자동 게이트 `pnpm verify` 63/63 · build 76.5kb gzip — 제가 머지 전 실행.)

🌐 dev 서버 (user-runs)
```
GOOTTE_ROOTS=$HOME/Documents/ai pnpm dev   → localhost:5173
```

✅ 테스트 (브라우저, jinwooauto 선택 · plan 탭)
- 상단에 **[리스트 · 보드 · 타임라인]** 뷰모드 토글
- **보드** 클릭 → URL `?view=board` · **진행 중 / 착수 가능 / 선행 대기 3컬럼**(actionability 버킷 — worktree 있음 / 의존 충족 / 선행 미완, 헤더 hover=의미 tooltip) · count 배지 · 카드(status·할일수·deps), jinwooauto = 착수 가능 15
- 본문 16px(text-base) 가독성 — 프로젝트명·plan/lineage 내용 읽을 만한지 · 칩만 14px
- **타임라인** 클릭 → "015에서 렌더" 플레이스홀더(정상)
- 리스트 ↔ 보드 전환 시 URL 반영 · 뒤로가기 복원 · lineage 탭으로 가면 view 초기화

## 관련 todo / spec
- [014-kanban-board](../todo/014-kanban-board.md) — 뷰모드 인프라 + 칸반 (T3)
- [spec](../roadmap/project-manager/web-viz/spec.md) · [ADR-0002 뷰모드](../roadmap/project-manager/web-viz/adr/0002-viewmode-tab-structure.md) · [wireframe](../roadmap/project-manager/web-viz/wireframe.md) · [M-0003](../mermaid/INDEX.md#M-0003)
