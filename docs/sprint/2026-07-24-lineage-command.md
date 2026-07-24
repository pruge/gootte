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
> sprint `lineage-command` 완료 기준 (`/cling:notify --all`).

✅ 직접 확인 (CLI 실행 가능 — repo 루트에서):
- **`pnpm lineage ~/Documents/ai/jinwooauto`** → supersede 체인 15 + drop 40 (verbatim·결정적)
- `pnpm plan ~/Documents/ai/jinwooauto` → 순서 + (supersede 소유 시)뒤엎음 주석

자동 게이트 (제가 머지 전 실행 — 이미 green):
- `pnpm verify` → tsc 4/4 · **vitest 26/26** (신규 cli lineage 1: supersede 체인·drop verbatim)
- 실데이터: `pnpm lineage jinwooauto` 동작 확인

## 관련 todo / spec
- [007-cli-lineage](../todo/007-cli-lineage.md)
- [spec](../roadmap/project-manager/lineage-supersede/spec.md) — T6·T7
