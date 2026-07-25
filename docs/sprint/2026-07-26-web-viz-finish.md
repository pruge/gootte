---
created: 2026-07-26
status: in_progress
priority: normal
kind: bundle
todos: [016-graph-view, 017-worktree-panel]
worktree: web-viz-finish
startedAt: 2026-07-26
related_sprints: []
---

# web-viz-finish — supersede 그래프 + worktree 패널 (T5+T6)
> 묶음. 1 worktree = 1 sprint. web-viz(2c) 마지막 두 뷰 — 013 API 위 렌더. 014 뷰모드/탭 인프라 공유.

## scope
- 016-graph-view (normal) — lineage 탭 [체인|그래프] 토글에 git-graph 세로 DAG(순수 레이아웃 함수 + 커스텀 SVG).
- 017-worktree-panel (normal) — 새 worktree 탭, GitHub checks 룩 카드(활성 worktree + conflictRisk + sprint doc 링크).

## 🔴 Invariant 점검
- **INV-4** — 노드 kind/엣지·conflictRisk·worktree 상태는 **서버값 그대로**. 프론트는 그래프 **레이아웃(좌표)만** 계산(재판정 X). worktree "테스트할 것"=sprint doc 링크(산문 파싱 X).
- **INV-2** — 렌더 전용(드래그·편집 X).
- **INV-1** — `useLineage`/`useWorktree` 캐시만.

## 묶음 근거
- domain: 둘 다 web/frontend web-viz 마지막 뷰. shared-area: 014 뷰모드(lineage 토글)·탭(worktree 신규) 인프라 공유. 013 API(lineage nodes·/api/worktree) 이미 완성 → 렌더만.

## 작업 path (예상 phase)
### Phase 1 — 016 graph-view
- `useLineage`(nodes) → **순수 레이아웃 함수**(노드→좌표, 계층/스파인 배치) 단위 테스트 · 커스텀 SVG 세로 DAG(노드 스파인 + 엣지 supersede 실선/`supersede-partial` 색 파선/spawn/drop + ADR 배지). lineage 탭 [체인|그래프] 뷰모드(체인=기존 LineageView).

### Phase 2 — 017 worktree-panel
- `useWorktree(slug)`(`/api/worktree`) → GitHub checks 룩 카드(branch·base·conflictRisk semantic 색·initiative·sprint + sprint doc 링크). 새 **worktree 탭**(ADR-0002). 활성 0 = 빈 상태.

## 다음 단계 결정 필요
- 없음(spec·013 API 가 닫음). 두 뷰 독립(공유 파일 없음 — lineage vs worktree).

## 완료 기준
- 016 완료: vitest — 레이아웃 함수(노드→좌표) · 그래프 SVG 렌더(mock nodes/edges, partial 색·ADR 배지) · lineage 뷰모드 토글. tsc. dev 실렌더(jinwooauto 체인).
- 017 완료: vitest — worktree 카드 렌더(mock WorktreeResponse, conflictRisk 색·링크) · 빈 상태 · worktree 탭 추가. tsc.
- 전체 회귀: `pnpm verify`(104+) green + `mermaid-refs-check`.

## 사용자 테스트
> `/cling:worktree` 개발 완료 보고 시 채움.

## 관련 todo / spec
- [016-graph-view](../todo/016-graph-view.md) — supersede 그래프 (T5)
- [017-worktree-panel](../todo/017-worktree-panel.md) — worktree/test 패널 (T6)
- [spec](../roadmap/project-manager/web-viz/spec.md) · [ADR-0001 커스텀렌더](../roadmap/project-manager/web-viz/adr/0001-custom-rendering-references.md) · [ADR-0004 worktree패널](../roadmap/project-manager/web-viz/adr/0004-worktree-panel-scope.md) · [M-0003](../mermaid/INDEX.md#M-0003)
