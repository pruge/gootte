---
created: 2026-07-27
status: pending           # pending | in_progress | done
priority: normal
kind: single
todos: [017-worktree-panel]
worktree: null            # /cling:worktree 가 박음
related_sprints: []
---

# worktree-panel — 현재 작업중 worktree + 클릭→sprint 문서
> 단독. 1 worktree = 1 sprint. 리셋 재정의(옛 ADR-0004 단순화).

## scope
- 017-worktree-panel (normal) — 새 worktree 탭에 활성 worktree 카드(branch·initiative·sprint·conflictRisk), 카드 클릭 → 그 sprint 문서(DocDrawer kind=sprint).

## 🔴 Invariant 점검 (프로파일 Invariants 중 이 sprint 에 걸리는 것)
- **INV-4** (read-path 결정적·LLM-free) — worktree 카드는 `/api/worktree`의 구조적 값(branch·conflictRisk 등) 그대로 렌더. 산문 파싱/요약 X. conflictRisk 색 매핑은 결정적.
- **INV-3** (뷰 = 현재 SoT) — worktree 목록·sprint 문서 매 요청 재계산(캐시 복제 X).
- **INV-2** (read-only) — sprint 문서 read만(readDoc). write 없음.

## 작업 path (예상 phase)
### Phase 1 — frontend 데이터
- `lib/api.ts` `fetchWorktree(slug)` + `lib/query.ts` `useWorktree` + `qk.worktree`. (backend `/api/worktree` 이미 존재.)

### Phase 2 — DocDrawer kind 파라미터화
- `DocDrawer`에 `kind: "todo" | "sprint"` prop 추가(현재 "todo" 고정). readDoc·useDoc은 이미 kind 지원 → 배선만.

### Phase 3 — worktree 탭 + 뷰
- `useUrlState` `Tab` 타입에 `"worktree"` 추가.
- `WorktreeView` + `WorktreeCard` — 활성 worktree 카드(branch·base·initiative·sprint·conflictRisk semantic 색), 카드 클릭 → sprint DocDrawer.
- `Tabs`에 worktree 추가, `MainPanel` 분기. 활성 0 = 빈 상태.

## 다음 단계 결정 필요
- 없음(재정의 설계 확정). 카드 룩은 기존 semantic 토큰·Tabler로 plan 카드와 일관.

## 완료 기준
- 017 완료: `pnpm -C code/web verify` green — WorktreeView 카드 렌더(mock: branch·initiative·sprint·conflictRisk) · 빈 상태 · 카드 클릭 → sprint DocDrawer · 탭 전환.
- 전체 회귀: dev — 활성 worktree 있는 프로젝트 선택 → worktree 탭에 카드 → 클릭 → sprint 문서 열림. plan/lineage 무회귀.

## 관련 todo / spec
- [017-worktree-panel](../todo/017-worktree-panel.md) — 이 sprint 의 유일 todo (재정의본)
