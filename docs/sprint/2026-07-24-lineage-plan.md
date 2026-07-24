---
created: 2026-07-24
status: in_progress
priority: high
kind: single
todos: [002-state-projections]
worktree: lineage-plan
startedAt: 2026-07-24
related_sprints: []
---

# lineage-plan — state(worktree 매핑) + plan/rationale(B2 랭킹)
> 단독. lineage-engine phase 1 핵심 계산 엔진(T3·T5). 001(파서·git primitive) 위에 얹힘.

## scope
- `002-state-projections` (high) — T3 core state(순수, lineage DAG + worktree↔initiative 매핑) + T5 projections(순수, B2 3-분할 ordering → plan + rationale)

## 🔴 Invariant 점검
- **INV-1**(projection 재생성·저장 SoT 없음) — state·projections 는 순수 함수, 결과 저장 X.
- **INV-2**(관리대상 읽기 전용) — state 는 파싱 결과 + git 신호를 *읽어* 계산만. mutate 없음.
- INV-3 = 해당 없음(digest emit/CLI 는 003).

## 작업 path (예상 phase)
### Phase 1 — T3 state (`code/web/core/state/`, 순수)
- parsed(todo/sprint/ledger/INDEX) + core-io 가 준 worktree 목록 → **lineage DAG**(supersede/spawn/dep 엣지) + 이니셔티브 상태 + **worktree↔initiative 매핑**(sprint→todos→`initiative:` 체인).

### Phase 2 — T5 projections (`code/web/core/project/`, 순수)
- **B2 3-분할**: active(활성 worktree)/ready(의존 충족+설계완결 proxy)/blocked(미충족 의존).
- **정렬**: active(conflictRisk high=방치비용 큰 것 먼저) → 의존 체인 → ready 독립+설계완결 정지점 뒤 → blocked sink. 동률=priority→INDEX 순서.
- **GitSignal 조립**: state worktree 매핑 + 001 `computeGitSignal`(refs). → `PlanItem[]` + `PlanRationale`.

## 다음 단계 결정 필요
- 없음 (spec 이 닫음 — B2/B6 = spec §B2).

## 완료 기준
- `002` 완료: state DAG·worktree↔initiative 매핑 vitest green · 3-분할 랭킹·NOW·근거·GitSignal 조립 vitest green.
- **핵심 회귀**: 합성 lineage fixture(active worktree + 독립 설계완결 + blocked)로 **①②③④ 순서 재현** — 사용자 제공 샘플 형태.
- 전체 회귀: `pnpm -r exec tsc --noEmit` + `pnpm exec vitest run` green.

## 사용자 테스트
> (worktree 개발 완료 시 `/cling:notify --all` 로 채움.)

## 관련 todo / spec
- [002-state-projections](../todo/002-state-projections.md)
- [spec](../roadmap/project-manager/lineage-engine/spec.md) — T3·T5, §B2
