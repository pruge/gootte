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

# worktree/test 패널 (T6)

spec T6. [ADR-0004](../roadmap/project-manager/web-viz/adr/0004-worktree-panel-scope.md).

- `useWorktree(slug)`(`/api/worktree`) → **GitHub checks 룩** 커스텀 카드: 활성 worktree(branch·base·`conflictRisk` semantic 색·initiative·sprint) + "테스트할 것" = sprint doc 링크(산문 파싱 X, INV-4). 새 **worktree 탭**(ADR-0002).
- 활성 worktree 0 = 빈 상태.

**acceptance**: vitest — worktree 카드 렌더(mock WorktreeResponse, conflictRisk 색·링크) · 빈 상태 · 탭 추가 · tsc.
**의존**: 013
