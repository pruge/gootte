# spec — web-viz · phase 2c 시각화 레이어 (TBD 제로)

> ⚠️ **부분 supersede (2026-07-29 · web-structure ADR-0003)** — **칸반**(`buildKanban`·board 뷰·`/api/board`·`BoardResponse`·`KanbanColumn`)은 [web-structure](../web-structure/spec.md)가 보드 슬롯을 구조 뷰로 교체하며 **제거**. 착수-준비도는 리스트 뷰가 흡수. **생존**: Gantt/타임라인(`buildGantt`)·lineage viz·나머지 viz projection.

> blueprint 종속. 전체·seam·불변식 = [../blueprint.md](../blueprint.md). 구조 = [M-0003](../../../mermaid/INDEX.md#M-0003)(2c, sources: M-0001·M-0002). 레이아웃 = [wireframe.md](wireframe.md).

## Goal
2a의 텍스트 plan/lineage를 **시각화**로 확장 — 칸반 보드·날짜축 타임라인·supersede git-graph·worktree 패널. 같은 CORE projection(결정적)을 소비, 프론트는 렌더만. 사용자가 "현재/왜/다음"을 **한눈에**.

## Architecture (blueprint 소비) → [M-0003]
```
CORE: buildPlan-partition ─┬─ buildKanban → columns
                           └─ (ordering)          buildGantt → rows/bars/markers
      state.lineage(nodes/edges) → graph        loadProjectState(worktrees+gitSignals) → worktree
        ↓ (신규 endpoint)
backend: /api/board · /api/timeline · /api/worktree · /api/lineage(+nodes)
        ↓ TanStack Query
frontend: plan탭[리스트|보드|타임라인] · lineage탭[체인|그래프] · worktree탭 (커스텀 SVG/CSS)
```

## Components (영향/신규)
| 컴포넌트 | 변경 | 내용 |
|---|---|---|
| `web/contract` | 확장 | `KanbanColumn`·`GanttRow/Bar/Marker`·`WorktreeStatus` + envelope 3종 · `Sprint`에 날짜 · `LineageResponse`에 `nodes` |
| `web/core` | 신규 projection | `partitionInitiatives`(buildPlan에서 추출·공유) · `buildKanban` · `buildGantt` · `parseSprint` 날짜 |
| `web/backend` | 라우트 추가 | `/api/board/:slug`·`/api/timeline/:slug`·`/api/worktree/:slug` · `/api/lineage`에 nodes |
| `web/frontend` | 뷰 추가 | 뷰모드 토글 + 보드·타임라인·그래프 뷰 + worktree 패널 |

## Invariants (프로파일 verbatim)
- **INV-1** projection 파생 — 칸반/Gantt/그래프 데이터는 md SoT에서 재생성. 프론트는 2차 SoT 복제 X(TanStack Query 캐시만).
- **INV-2** 읽기 전용 — 드래그로 상태 변경 없음(칸반은 표시 전용). backend는 read만.
- **INV-4** read-path 결정적·LLM-free — **버킷 분류·순서·edge kind·바 기간 = CORE 결정적 계산**. 프론트는 그 값으로 **픽셀 배치(레이아웃)만** — 데이터 재판정 X. 산문(note·resolvedBy·rationale)은 verbatim.
- INV-3 항상 현재 반영 — 2c=요청 시 재계산. live push=2b.

## Scope / Non-goals
- **scope**: 칸반(Linear 룩)·타임라인(CI 워터폴 룩, **날짜축** — cling은 날짜 기록)·supersede 그래프(git-graph)·worktree 패널(GitHub checks 룩). 뷰모드 토글. localhost read-only.
  - **Gantt granularity = 날짜(YYYY-MM-DD)** — sprint startedAt/endedAt가 날짜라 시각(hour) 축 불가. hour-level은 타임스탬프 캡처 필요 = future(2c 밖).
- **non-goal**: 드래그 상태변경(INV-2) · 실시간 push·auth(2b) · reactflow 등 force 그래프 라이브러리(anti-template·번들) · 멀티머신(6).

## Data Model / Contracts (blueprint seam 소비 + 2c 고유 신규)
**재사용(정의 X):** `PlanItem`(칸반 카드)·`LineageNode/Edge`(그래프)·`GitSignal`·`Worktree`.
**신규 (CONTRACT `@gootte/contract` 추가 — 2c 고유 seam):**
```ts
KanbanColumn { key: "active"|"ready"|"blocked"; title: string; items: PlanItem[] }
GanttBar    { kind: "sprint"; label: string; start: string; end: string }  // 날짜 YYYY-MM-DD (B1: sprint만 — worktree는 날짜 소스 없음, 017 패널이 담당)
GanttMarker { at: string; kind: "kickoff"|"re-kickoff"; label: string }    // 날짜
GanttRow    { initiative: string; bars: GanttBar[]; markers: GanttMarker[] }
WorktreeStatus { slug; branch; base; initiative: string|null; sprint: string|null; signal: GitSignal }
// envelopes
BoardResponse    { project: string; columns: KanbanColumn[] }
TimelineResponse { project: string; from: string|null; to: string|null; rows: GanttRow[] }
WorktreeResponse { project: string; worktrees: WorktreeStatus[] }
```
**기존 확장(additive):**
- `Sprint` += `created?: string · startedAt?: string · endedAt?: string`(parseSprint가 frontmatter에서). Gantt 바 기간 소스.
- `LineageResponse` += `nodes: LineageNode[]`(graph가 스파인 노드 = status/kind 사용; 2a 체인 뷰는 무시 — 안전).

**소유권:** 전부 CORE가 write(계산), 프론트 read. 단일 소유.

## Reuse map
CORE `buildPlan` 3-파티션 로직 → `partitionInitiatives`로 추출해 buildPlan+buildKanban 공유(DRY). `state.lineage`·`GitSignal`·`Worktree`·`KickoffEvent.at`·`Sprint` 날짜 = 데이터소스. 새 계산 = 버킷/바/마커 조립뿐. 프론트 셸(009/010) 재사용, 뷰만 추가.

## Test Strategy
- `web/core`: **vitest** — `partitionInitiatives`(active/ready/blocked 정확 + buildPlan indexOrder tiebreak 보존, N1), `buildKanban`(컬럼·카드), `buildGantt`(sprint 바 기간·마커·날짜 bounds), `parseSprint`(날짜). **fixture는 날짜 다양하게**(W2 — 같은 날짜면 바 겹침).
- `web/backend`: **vitest** `app.request` — 3 신규 endpoint envelope zod 검증 + 404. fixture proj.
- `web/frontend`: **vitest + testing-library** — 각 뷰 렌더(mock query data): 보드 컬럼·카드, 타임라인 바 위치(계산 함수 단위), 그래프 노드/엣지 SVG, worktree 카드. + Playwright e2e에 board/graph 탐색 추가.
- verify: `tsc --noEmit` + vitest. e2e = `pnpm e2e`.

## Operations 영향
- **없음** — 새 dev 서버·명령·의존 0(커스텀 렌더, 라이브러리 미도입). 기존 `pnpm dev`·`pnpm e2e` 그대로. 번들 예산 유지(app <300kb).

## Task Breakdown
| T | 내용 | Files | acceptance | dep |
|---|---|---|---|---|
| **T1** | CONTRACT 타입 + CORE projection | `code/web/contract/**` · `code/web/core/**` | `partitionInitiatives`·`buildKanban`·`buildGantt`·`parseSprint`날짜 · vitest green (fixture state → 정확한 컬럼/바/마커) | — |
| **T2** | backend endpoint | `code/web/backend/**` | `/api/{board,timeline,worktree}/:slug` + `/api/lineage`(nodes) zod 검증 JSON · `app.request` vitest · 404 | T1 |
| **T3** | 뷰모드 인프라 + 칸반 보드 | `code/web/frontend/src/**` | URL `?view=` 훅 · plan탭 [리스트\|보드\|타임라인] 토글 · **Linear 룩** 보드(3컬럼·카드·NOW·priority) · vitest | T2 |
| **T4** | 타임라인(Gantt) | `code/web/frontend/src/**` | **CI 워터폴** SVG — 이니셔티브 행·**sprint 바**·이벤트 마커·**날짜축** · 바 위치 계산(날짜→x) vitest. 마커 희소 정상(W1) | T3 |
| **T5** | supersede 그래프 | `code/web/frontend/src/**` | **git-graph** 세로 DAG SVG — 노드 스파인·supersede/partial/spawn 엣지(색)·ADR 배지 · lineage탭 [체인\|그래프] 토글 · vitest | T2 |
| **T6** | worktree/test 패널 | `code/web/frontend/src/**` | **GitHub checks 룩** — 활성 worktree 카드(branch·base·conflictRisk 색·initiative) · 새 worktree 탭 · vitest | T2 |

**DAG:** `T1→T2→{T3→T4, T5, T6}` (T4는 T3 뷰모드 인프라 소비)

## 외부 의존
없음 (커스텀 렌더). 기존 스택만.
