---
status: done
completedAt: 2026-07-27
priority: normal
sprint: worktree-panel
initiative: null
area: [web/frontend]
source: spec-decompose
related: [../roadmap/project-manager/web-viz/spec.md, 013-viz-api]
created: 2026-07-25
---

# worktree 패널 — 현재 작업중 + 클릭→sprint 문서

> 리셋 재정의: 옛 "GitHub-checks 룩 + 테스트 링크"(ADR-0004) → **활성 worktree 표시 → 클릭하면 그 sprint 문서**로 단순화.

## 목적
지금 어떤 작업이 진행중인지(활성 worktree) 한눈에 보고, 클릭하면 그 sprint 문서를 바로 열어 무엇을 하는 작업인지 파악.

## 설계
- 새 **최상위 worktree 탭** (plan/lineage와 peer — `Tab` 타입에 `"worktree"` 추가, useUrlState).
- `useWorktree(slug)`(`/api/worktree` — 이미 존재) → 활성 worktree 카드: branch·base·initiative·**sprint**·`conflictRisk`(semantic 색). 구조적 값 그대로(INV-4, 산문 파싱 X).
- **카드 클릭 → DocDrawer로 그 sprint 문서**(kind=sprint). DocDrawer에 `kind` 파라미터 추가(현재 todo 고정) — readDoc/보기·raw는 이미 sprint 지원.
- 활성 worktree 0 = 빈 상태.

## 작업 (예상)
- frontend: `fetchWorktree`/`useWorktree` 추가, `WorktreeView` + `WorktreeCard`, `Tabs`에 worktree 추가, `MainPanel` 분기, `DocDrawer` kind 파라미터화.
- 재사용: `/api/worktree`(WorktreeResponse), `readDoc(kind=sprint)`, `DocDrawer`.

## acceptance
vitest — WorktreeView 카드 렌더(mock WorktreeResponse: branch·initiative·sprint·conflictRisk 색) · 빈 상태 · 카드 클릭 → sprint DocDrawer 열림 · 탭 전환. tsc. dev 실렌더(활성 worktree 있는 프로젝트).
**의존**: 013(완료)
