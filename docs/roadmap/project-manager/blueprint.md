# blueprint — project-manager (gootte epic)

> epic-level 전체 설계·단계화. 씨앗 = [discovery](../../_memo/discovery-rekickoff-lineage.md).
> phase kickoff = `/cling:kickoff project-manager/<phase>` (부모 이 파일을 로드해 scope·seam 소비).

## goal
여러 cling 프로젝트를 **프로젝트별 실시간 관리** — 연쇄 re-kickoff lineage 를 사람+AI 가 "현재/왜/다음" 파악. 핵심 산출 = **plan+rationale**(개발해야 할 순서 full + 왜).

## scope — 전체 capability
**P1 lineage/상태**: 자동발견 · 파싱 · 상태모델 · plan+rationale · 사람 render(칸반·Gantt시간축·supersede그래프·worktree상태·테스트할것) · AI(digest + CLI agent-skill).
**확장**:
- **ⓐ 멀티머신 통합** — 집/회사 등 여러 머신 프로젝트를 한 뷰
- **ⓑ 리포트/내보내기** — 기간 진행 요약 · export
- **ⓒ 팀 공유** — multi-user auth (지금은 나만·.env)
- **ⓓ 알림 채널** — worktree 검토/테스트 필요 → slack/push
- **P2 학습 스토어** — cross-project 학습 집계·일반화·분류 → 새 프로젝트 bootstrap

**non-goal (전체)**: 제어(관찰 전용, seam 만 예약) · gootte 가 cling SoT 를 write.

## reuse map
기존 cling 스키마(ledger/ADR/mermaid/INDEX/todo) 파싱 — 새 포맷 발명 금지. jinwooauto 실데이터 + contract 패턴 참조.

## architecture — 재사용 spine → [M-0001](../../mermaid/INDEX.md#M-0001)
- **순수 CORE** (`web/core`, 부수효과 0): `parse(content)` · state · projections(plan·rationale·kanban·gantt·graph·report). vitest 완전. **(B3 해소)**
- **IO 층** (`web/core-io`): fs read · discover · git(GitSignal) · emit. CORE 와 분리 — CORE 순수성 보존.
- **CONTRACT** (`web/contract`, zod SoT): 공유 타입. 모든 phase·surface·(외부)cling-writer 가 소비/파생.
- **얇은 어댑터**: CLI · digest · backend(WS) · frontend · Android · notify · export · auth · aggregation-source.
- **예약 모듈**(구조만): 제어 seam · 학습 스토어 · 멀티머신 aggregation · auth · notify · report.

### 공유 seam (Contract 씨앗 — phase 가 소비/파생)
> 🔴 실제 zod 패키지 스캐폴드 = **phase 1 T1**(greenfield — 여기선 스키마 *정의*만, 코드 X).
- `Project { slug, path, source? }`  # source = machine (ⓐ 예약)
- `Initiative` · `TodoItem` · `Sprint` · `Worktree{slug,branch,base,initiative}` · `LineageNode/Edge`
- `KickoffEvent { kind(kickoff|re-kickoff), at, trigger?, interrupted?, supersedes[], spawns[] }`  ← ③ 기록계약
- `GitSignal { worktreeBase?, mainCommitsSince, overlapFiles[], conflictRisk }`
- `PlanItem` · `PlanRationale` · `Digest`
- **예약**: `Report`(ⓑ) · `Notification`(ⓓ) · `User/Auth`(ⓒ)

### ③ re-kickoff 기록 계약 — external-writer seam
> 🔴 이 seam 은 **gootte(reader) + cling 프레임워크(writer) 공동 소유 = cross-repo.** blueprint 표준 seam(프로젝트 내 phase 공유)이 아니라 *외부 도구 공유 seam* — Contract 에 버전 박고 cling writer 규약이 짝.
- **스키마** = `KickoffEvent`(위). **저장** = 관리대상 `ledger.md ## events`(정형 md, json 아님 — cling md=SoT 철학).
- **하이브리드**: gootte phase-1 = 구조화 있으면 읽고 **없으면 산문 fallback**(cling 무변경으로 시작).
- **paired 외부 변경**: cling reconcile 을 정형 `## events` emit 로 조이는 **writer 규약 = 별도 cling 작업**(gootte phase 안 막음). 레거시(jinwooauto 99) = 산문 fallback + 후속 backfill.

### Invariants (전체)
- **INV-1** projection(digest·render)은 관리대상 md SoT 에서 재생성되는 파생물. 2차 SoT 금지.
- **INV-2** 관리대상 **읽기 전용** — gootte 는 자기 `.gootte/` 네임스페이스만 write + `.gitignore` 1줄 append(carve-out, **B4 해소**). cling SoT 문서 절대 mutate X.
- **INV-3** 뷰·digest 는 항상 현재 SoT 반영 — CLI=호출 시 재계산, 웹=watcher push.

## phases — 로드맵 (Now/Next/Later + 소비 seam + DAG)
| phase | track | capability | 소비 seam | dep |
|---|---|---|---|---|
| **1 · lineage-engine** ✅ done | E — 엔진/lineage | CORE(pure)+core-io+CONTRACT+CLI+digest+agent-skill · jinwooauto 검증 | 전체 CONTRACT **스캐폴드**(T1) | — |
| **1b · lineage-supersede** ✅ done | E — 엔진/lineage | supersede/drop 채움 + `gootte lineage` + plan rationale (타임라인=2차) | LineageEdge/TodoItem **확장** | 1 |
| **2a · web-dashboard** ✅ done | W — 웹 대시보드 | Hono API + React(목록→plan/lineage read-only) + theme 3-mode · localhost · Playwright e2e | CORE projections·CONTRACT | 1b |
| **2b · web-realtime** 🔜 Now | W — 웹 대시보드 | WS + watcher(즉시) + .env 로그인 | CORE·CONTRACT | 2a |
| **2c · web-viz** 🔜 Next | W — 웹 대시보드 | 칸반·Gantt(시간축)·supersede 시각그래프·worktree·test | CORE·CONTRACT | 2a |
| **2d · track-grouping** 🔜 Next | W — 웹 대시보드 | 대분류(track) 그룹핑 — ledger/profile track → 정규화 → 보드 칩·타임라인/리스트 그룹 | `Track` seam(external-writer, KickoffEvent 동형)·CORE·CONTRACT | 2c |
| **3 · remote-mobile** ⬜ Later | R — 원격/모바일 | CF 터널 노출 + Android 뷰어(Kotlin codegen) | CONTRACT(codegen) | 2 |
| **4 · notify** ⬜ Later ⓓ | X — 확장 | worktree 검토/test → slack/push 어댑터 | `Notification`·`PlanItem` | 2 |
| **5 · report-export** ⬜ Later ⓑ | X — 확장 | 기간 요약 projection + export | `Report`·state | 2 |
| **6 · distributed** ⬜ Later ⓐⓒ | X — 확장 | 멀티머신 aggregation + multi-user auth | `Project.source`·`User` | 3 |
| **7 · learning-store** ⬜ Later P2 | X — 확장 | cross-project 학습 집계·일반화·분류·bootstrap | CORE·CONTRACT | 1 |

- 첫 phase = **lineage-engine**(wedge — AI/터미널에 즉시 값 + 파싱/state/git 리스크 조기 제거).
- 4·5·7 은 phase 1 state 만 있으면 독립 착수 가능(2 는 UI 설정용). ledger 미선언 → 로드맵은 본 blueprint 가 SoT.

## open (각 phase kickoff 이 닫을 것)
- **phase 1**: conflictRisk 계산법(**B1** — `git merge-tree` dry-run 유력) · plan ordering 랭킹함수(**B2**) · CORE/IO 파일 경계 상세.
- **phase 2**: 칸반/Gantt 레이아웃 · watcher 메커니즘 · .env 로그인.
- **외부(cling)**: reconcile writer 규약(③ paired) — 별도 cling 작업.
