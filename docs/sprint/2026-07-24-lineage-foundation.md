---
created: 2026-07-24
status: in_progress
priority: high
kind: single
todos: [001-contract-parsers]
worktree: lineage-foundation
startedAt: 2026-07-24
related_sprints: []
---

# lineage-foundation — Contract seam + 순수 파서 + git primitive
> 단독. 1 worktree = 1 sprint. lineage-engine phase 1 의 토대(T1·T2·T4).

## scope
- `001-contract-parsers` (high) — T1 contract 스캐폴드 + T2 core 파서(순수) + T4 core-io worktree 스캔·git primitive

## 🔴 Invariant 점검
- **INV-2**(관리대상 읽기 전용) — 이 sprint 는 parse·git·worktree 스캔 = **읽기만**. 관리대상 mutate 없음(digest write 는 002+).
- **INV-1**(projection 재생성·저장 SoT 없음) — 파서/state 는 순수, 결과 저장 X.
- INV-3 = 해당 없음(CLI/digest 없음).

## 작업 path (예상 phase)
### Phase 1 — pnpm 모노레포 부트스트랩
- `code/web/` pnpm workspace + `@gootte/contract`·`@gootte/core`·`@gootte/core-io` 패키지 골격 + tsconfig + vitest.

### Phase 2 — T1 contract (`code/web/contract/`)
- zod 스키마: `Project·Initiative·TodoItem·Sprint·Worktree·LineageNode/Edge·KickoffEvent·GitSignal·PlanItem·PlanRationale·Digest`. `tsc` green.

### Phase 3 — T2 core 파서 (`code/web/core/parse/`, 순수)
- `parse(content)`: ledger/ADR/mermaid/INDEX/todo **+ sprint** frontmatter → 타입. jinwooauto fixture.

### Phase 4 — T4 core-io git primitive (`code/web/core-io/git/`)
- worktree 스캔(`.claude/worktrees/`) · `conflictRisk(base,mainTip,wtTip)`=`git merge-tree` · `merge-base`. 임시 git repo fixture.

## 다음 단계 결정 필요
- 없음 (spec 이 닫음 — B1~B6 closed).

## 완료 기준
- `001` 완료: 타입 export + `tsc` green · jinwooauto fixture 파싱 vitest green · merge-tree fixture → high/med/low vitest green.
- 전체 회귀: `pnpm -r test` + `pnpm -r exec tsc --noEmit` green.

## 사용자 테스트
> (worktree 개발 완료 시 `/cling:notify --all` 로 채움.)

## 관련 todo / spec
- [001-contract-parsers](../todo/001-contract-parsers.md) — 토대
- [spec](../roadmap/project-manager/lineage-engine/spec.md) — T1·T2·T4
