---
created: 2026-07-24
status: in_progress
priority: normal
kind: single
todos: [007-cli-lineage]
worktree: lineage-command
startedAt: 2026-07-24
related_sprints: []
---

# lineage-command — gootte lineage CLI + jinwooauto 검증 (lineage-supersede finish)
> 단독. 엔진(005+006) 위 CLI 명령 + 실데이터 acceptance.

## scope
- `007-cli-lineage` (normal) — T6 `gootte lineage <proj>` 명령 + 루트 `pnpm lineage` · T7 jinwooauto acceptance(체인·drop verbatim)

## 🔴 Invariant 점검
- **INV-2** 읽기 전용 · **INV-4** read-path 결정적·LLM-free(verbatim).

## 작업 path
### Phase 1 — T6 CLI (`code/web/cli`)
- commands.ts `lineageText(repoPath)` = loadProjectState → renderLineage. main.ts `lineage` 분기. 루트 `pnpm lineage` 스크립트.
### Phase 2 — T7 acceptance (`__fixtures__`)
- 합성 프로젝트로 `lineageText` = supersede 체인·drop verbatim vitest + `pnpm lineage jinwooauto` 실행 확인.

## 다음 단계 결정 필요
- 없음.

## 완료 기준
- `007`: `gootte lineage <proj>` = supersede 체인 + drop 텍스트 · 루트 `pnpm lineage` 동작 · jinwooauto 실데이터 acceptance(체인 15 + drop 40).
- 전체 회귀: `pnpm verify` green.

## 사용자 테스트
> (worktree 개발 완료 시 `/cling:notify --all` 로 채움.)

## 관련 todo / spec
- [007-cli-lineage](../todo/007-cli-lineage.md)
- [spec](../roadmap/project-manager/lineage-supersede/spec.md) — T6·T7
