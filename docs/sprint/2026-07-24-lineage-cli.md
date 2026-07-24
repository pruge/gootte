---
created: 2026-07-24
status: in_progress
priority: high
kind: bundle
todos: [003-cli-digest, 004-skill-verify]
worktree: lineage-cli
startedAt: 2026-07-24
related_sprints: []
---

# lineage-cli — CLI + digest + agent-skill + jinwooauto 검증 (phase 1 완주)
> 묶음. 003(discover+emit+CLI) + 004(agent-skill+검증) = lineage-engine phase 1 finish line.

## scope
- `003-cli-digest` (high) — T6 core-io discover · T7 core-io emit(`.gootte/PLAN.md`) · T8 `gootte` CLI(plan/digest/discover)
- `004-skill-verify` (normal) — T9 agent-skill `SKILL.md` · T10 jinwooauto 실데이터 acceptance

## 🔴 Invariant 점검
- **INV-2**(읽기 전용) — discover/CLI는 읽기. **emit은 관리대상 `.gootte/` 네임스페이스만** write(AUTO-GENERATED) + gitignore 1줄. cling SoT mutate X.
- **INV-1**(projection 재생성 파생물) — digest는 md SoT에서 재생성.
- **INV-3**(항상 현재 반영) — CLI 호출 시 재계산(무staleness).

## 묶음 근거
- phase 1 경계 — CLI(T8)와 그 acceptance(T10)가 tight-coupled. 004 tail 가벼움(SKILL.md + test).

## 작업 path (예상 phase)
### Phase 1 — core-io discover + emit (T6·T7)
- `discover`: 머신 scan → `.cling/profile.md` 프로젝트 목록. `emit`: projection → `<repo>/.gootte/PLAN.md`(AUTO-GENERATED 헤더, gitignore).
### Phase 2 — CLI 배선 (T8)
- `gootte` CLI: `plan <proj>`·`digest <proj>`·`discover`. **IO(파서·git·discover) → 순수 CORE(state·plan) 배선** — CLI가 wiring 지점(core는 core-io를 import 안 함).
### Phase 3 — agent-skill (T9)
- `code/web/cli/skill/SKILL.md`: "관리 컨텍스트면 `.gootte/PLAN.md` read 또는 `gootte plan .`".
### Phase 4 — jinwooauto acceptance (T10)
- `gootte plan jinwooauto` 실행 → 순서+왜+방치비용이 실데이터로 나오는지. fixture 기반 acceptance.

## 다음 단계 결정 필요
- 없음 (spec 이 닫음).

## 완료 기준
- `003`: `gootte plan jinwooauto` = 순서(full)+왜 텍스트 · `gootte digest jinwooauto` = `.gootte/PLAN.md` 생성 · `gootte discover` = 로컬 프로젝트 목록.
- `004`: SKILL.md 라우팅 · **jinwooauto 실데이터 plan 정확**(파싱 하이브리드·방치비용·랭킹).
- 전체 회귀: `pnpm -r exec tsc --noEmit` + `pnpm exec vitest run` green.

## 사용자 테스트
> (worktree 개발 완료 시 `/cling:notify --all` 로 채움.)

## 관련 todo / spec
- [003-cli-digest](../todo/003-cli-digest.md) · [004-skill-verify](../todo/004-skill-verify.md)
- [spec](../roadmap/project-manager/lineage-engine/spec.md) — T6~T10
