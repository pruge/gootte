# spec — lineage-engine · project-manager phase 1 (TBD 제로)

> blueprint 종속 phase. 전체·seam·불변식 = [../blueprint.md](../blueprint.md). 구조 = [M-0001](../../../mermaid/INDEX.md#M-0001).

## Goal
임의 cling 프로젝트(검증=jinwooauto)에 대해 **"개발해야 할 순서(full) + 왜"**(plan+rationale)를 `gootte` CLI + digest 파일로 산출. AI 가 세션 부팅에 읽어 `cling:sprint` 재스캔 없이 **현재/왜/다음** 복원. blueprint 재사용 spine(**순수 CORE + IO + CONTRACT**) 확립(2~7차가 얹힘).

## Architecture (blueprint 소비)
[M-0001]. blueprint 가 심은 spine 을 phase 1 이 구현: **순수 CORE**(`web/core`) + **IO**(`web/core-io`) + **CONTRACT**(`web/contract`). phase 1 어댑터 = CLI · digest emit · discovery(core-io).

## Components (신규)
| 컴포넌트 | 경로 | 내용 |
|---|---|---|
| `web/contract` | `code/web/contract/` | blueprint Contract seam **최초 스캐폴드**(zod). TS+JSON schema. 예약타입(Report/Notification/User)은 후속 phase 가 add |
| `web/core` | `code/web/core/` | **순수**: `parse(content)`(sprint 포함) · state(lineage DAG · **worktree↔initiative 매핑**) · projections(plan·rationale). 부수효과 0 |
| `web/core-io` | `code/web/core-io/` | fs read · discover · **worktree 스캔(`.claude/worktrees/`)** · **git primitive**(conflictRisk·merge-base) · emit |
| `web/cli` | `code/web/cli/` | `gootte` CLI + agent-skill `SKILL.md` |

## Invariants (blueprint verbatim)
- **INV-1** projection 재생성 파생물, 2차 SoT 금지.
- **INV-2** 관리대상 읽기 전용 — `.gootte/` 네임스페이스만 write(AUTO-GENERATED) + `.gitignore` 1줄. cling SoT mutate X (**B4 carve-out**).
- **INV-3** 항상 현재 SoT 반영 — phase1 = CLI 호출 시 재계산(무staleness). watcher push = 2차.

## Scope / Non-goals
- **scope**: `gootte` CLI(`plan`·`digest`·`discover`) · digest emit · 자동발견 · jinwooauto 검증.
- **non-goal**: 웹 · watcher push · Android · notify · report · distributed · 학습 · 제어.

## Data Model / Contracts (blueprint seam 소비 — 재정의 X)
> 🔴 blueprint §공유 seam 을 phase 1 이 **최초 스캐폴드**(zod 패키지 생성). 재등록 아님 = 구현. 소유권: SoT = 각 프로젝트 cling docs(read-only), gootte 산출 = 파생.

phase 1 구현 타입 = `Project·Initiative·TodoItem·Sprint·Worktree·LineageNode/Edge·KickoffEvent·GitSignal·PlanItem·PlanRationale·Digest` (blueprint 정의). phase1 = **TS 직접 import**(JSON schema codegen 은 비-TS 소비처 생기는 **3차로 defer** — phase1 `contract:check`=`tsc`+zod, **N1**).
- `Worktree { slug, branch, base, initiative }` — **worktree↔initiative 매핑**은 순수 state 가 구성: core-io 가 준 `.claude/worktrees/` 목록 + parsed `sprint → todos → initiative:` 체인.

- **KickoffEvent 읽기 = 하이브리드**(blueprint 기록계약, ADR-0004): 관리대상 `ledger.md ## events` 정형 있으면 파싱, **없으면 산문 fallback**(`trigger` nullable — 없으면 rationale 에서 생략).

### B1 — `GitSignal.conflictRisk` (net-new, ADR-0002)
- **순수 git primitive**(core-io): `conflictRisk(base, mainTip, wtTip)` = `git merge-tree` dry-run → 충돌 → **high** · 충돌 없고 `overlapFiles`(main Δ ∩ worktree Δ) ≠ ∅ → **med** · 없음 → **low**. `base` = `git merge-base main <branch>`.
- **per-initiative 조립**(projections T5): state 의 worktree↔initiative 매핑으로 각 active 이니셔티브에 GitSignal 붙임. worktree 없는(non-active) 이니셔티브 = 생략.

### B2 — plan ordering (net-new, ADR-0002)
1. **3-분할**: `active`(활성 worktree 존재) / `ready`(의존 충족 + **설계완결**) / `blocked`(미충족 의존).
   - **설계완결 proxy** = `spec.md 존재 + todo 분해됨(pending) + 활성 worktree 없음`. (kickoff-review 는 파일 마커 없음 → proxy 로 측정, **B6**.)
2. **정렬**: active(conflictRisk high = 방치비용 큰 것 먼저 = ①) → 그 의존 체인(②) → ready 중 **독립 + 설계완결은 "자연 정지점"으로 뒤**(③, 안전하게 미룸) → blocked 는 선행 의존 뒤로 sink(④). 동률 = priority → INDEX Now/Next 저작 순서.
3. acceptance = jinwooauto hand-authored 기대 순서와 일치.

## Reuse map
blueprint §reuse map. 파서는 기존 cling 스키마를 읽음 — 새 포맷 발명 X.

## Test Strategy (컴포넌트별 verify)
- `web/contract`: `tsc` + zod 컴파일 (phase1 codegen 없음 — JSON schema=3차, N1). codegen drift-guard 는 3차 도입 시.
- `web/core`(순수): **vitest** — parse(+sprint)·state(+worktree 매핑)·projections. fixtures = jinwooauto 실 docs 복제(`__fixtures__/jinwooauto/`)
- `web/core-io`: **vitest** — git primitive(임시 git repo → merge-tree high/med/low)·worktree 스캔·discover·emit
- `web/cli`: acceptance — `gootte plan jinwooauto` = 기대 순서 + 근거
- verify(변경 컴포넌트): `tsc --noEmit` + `vitest` (+ contract 변경 시 `contract:check`)

## Operations 영향
`gootte` CLI (`plan`/`digest`/`discover`, who=claude-ok). profile `## Operations` 이미 반영.

## Task Breakdown
> 경로 = Source layout `code/` 기준. DAG 하단.

| T | 내용 | Files | acceptance | dep |
|---|---|---|---|---|
| **T1** | contract 스캐폴드 (blueprint seam zod, +Sprint·Worktree) | `code/web/contract/**` | 타입 export + `tsc` green | — |
| **T2** | core parsers (순수) — ledger/ADR/mermaid/INDEX/todo **+ sprint** | `code/web/core/parse/**` | jinwooauto fixture 파싱(sprint 포함) vitest | T1 |
| **T4** | core-io **worktree 스캔 + git primitive**(**B1**) `conflictRisk(base,mainTip,wtTip)`·`merge-base` | `code/web/core-io/git/**` | merge-tree fixture → high/med/low vitest | T1 |
| **T3** | core state (순수, lineage DAG) **+ worktree↔initiative 매핑**(worktree 목록 + sprint→todo→initiative) | `code/web/core/state/**` | DAG·상태·worktree 매핑 vitest | T2,T4 |
| **T5** | projections plan+rationale (순수, **B2**) — GitSignal **조립**(state 매핑+T4 primitive) + **설계완결 proxy** | `code/web/core/project/**` | 3-분할 랭킹·NOW·근거·GitSignal vitest | T3,T4 |
| **T6** | core-io discover | `code/web/core-io/discover/**` | `.cling` 프로젝트 목록 vitest | T1 |
| **T7** | core-io emit (digest) | `code/web/core-io/emit/**` | `<repo>/.gootte/PLAN.md` + AUTO-GENERATED 헤더 + gitignore | T5 |
| **T8** | CLI `gootte` | `code/web/cli/**` | `gootte plan jinwooauto` 텍스트 | T5,T6 |
| **T9** | agent-skill | `code/web/cli/skill/SKILL.md` | 라우팅(`.gootte/PLAN.md` read or `gootte plan .`) | T8,T7 |
| **T10** | jinwooauto 검증 | `code/web/core/__fixtures__/**` + acceptance | 실데이터 plan 정확(순서+왜+방치비용) | T8 |

**DAG:** `T1→{T2, T4, T6}` · `{T2,T4}→T3` · `{T3,T4}→T5→{T7,T8}` · `T6→T8` · `{T8,T7}→T9` · `T8→T10`

## 외부 의존
`zod` · `gray-matter` · markdown 파서(ledger/ADR/INDEX) · git(`simple-git` 또는 git CLI — `merge-tree`) · CLI(`clipanion`/`commander`). (chokidar=2차 watcher.)
