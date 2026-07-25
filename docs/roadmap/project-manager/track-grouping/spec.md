# spec — track-grouping (project-manager 2d)

> 결정-완결(TBD 제로). 구조 그림 = [M-0004](../../mermaid/INDEX.md#M-0004). brief = [brief.md](brief.md).

## Goal
관리대상 프로젝트의 **워크스트림(track)** 을 대분류 축으로 복원해, 보드·타임라인·리스트에서 각 이니셔티브/sprint 가 **무슨 기능에 속하는지** 한눈에 보이게 한다. 지능(어느 track)은 write-time(cling 세션)이 ledger 에 캡처, gootte 는 read-time 에 **정규화·그룹핑만**(INV-4 결정적·LLM-free).

## Architecture
`ledger.md`(track 원문) + `profile.md ## Tracks`(어휘) → **`normalizeTrack`(순수)** → `{key,label}` → 기존 projection(buildPlan/Kanban/Gantt)에 track 축 부착 + `trackOrder` → viz endpoint → 그룹 렌더. [M-0004](../../mermaid/INDEX.md#M-0004).

- **external-writer seam**(ADR-0001) — track 은 `KickoffEvent` 과 동형: gootte(reader) + cling(writer) 공동소유. 하이브리드 = **frontmatter `track:` 우선, 없으면 프로즈 `트랙:` fallback**.
- **label SoT = profile `## Tracks`**(ADR-0002) — 카노니컬 key→label 은 어휘가 유일 소유. 레거시 프로즈는 인라인 파생(어휘 없이도 동작).

## Components (영향/신규)
| 컴포넌트 | 변경 |
|---|---|
| `web/contract` | **신규** `Track` + `PlanItem.track`(string→`Track`) · `GanttRow.track` · `TimelineResponse/PlanResponse.trackOrder` (codegen) |
| `web/core` (parse) | **신규** `parseProfileTracks`·`normalizeTrack`(순수) · `parseLedger` track = frontmatter 우선 |
| `web/core` (state/projection) | `ProjectState.tracks`(vocab) · `buildPlan/buildKanban/buildGantt` 정규화 track 부착 + `trackOrder` |
| `web/core-io` | `load.ts` 가 `<project>/.cling/profile.md` `## Tracks` 읽어 vocab (INV-2 read-only) |
| `web/backend` | envelope 에 track/trackOrder 흐름(projection 파생 — 로직 X) |
| `web/frontend` | `TimelineChart` 그룹 레이아웃+hover · `PlanView` 섹션 헤더 · `BoardCard` track 칩 |

## Invariants (프로파일 해당분 — verbatim 준수)
- **INV-1** — track/그룹은 관리대상 md SoT(ledger `track` + profile `## Tracks`)에서 **재생성되는 파생물**. 손유지 2차 SoT 금지.
- **INV-2** — profile `## Tracks` 는 **읽기 전용**. gootte 는 관리대상 문서 mutate X (profile 읽기만 추가).
- **INV-3** — 그룹 뷰는 항상 현재 SoT 반영(재생성).
- **INV-4** — 정규화·그룹핑·순서는 **결정적·LLM-free**. label 은 어휘/프로즈에서 **verbatim 릴레이**(요약·추론 X). key 추출·정렬은 순수 규칙.

## Scope / Non-goals
- scope = brief §scope. **non-goal**: 보드 track 스윔레인 재편 · track 편집 · epic 2단 · cling writer 정형화 강제(레거시 프로즈 fallback 으로 흡수).

## Data Model / Contracts (seam — CONTRACT SoT)
> 🔴 경계 넘는 공유 타입 = `web/contract` zod SoT 에 정의 → 소비처 파생(codegen). blueprint §③ external-writer seam 계열.

```ts
// 신규 — track 대분류 (external-writer seam: cling writes ledger track: + profile ## Tracks; gootte reads)
export const Track = z.object({
  key: z.string(),    // canonical 식별자 (A~G 문자 또는 도메인 slug) — 그룹핑 키
  label: z.string(),  // 사람 읽는 한 줄 (profile ## Tracks 또는 프로즈에서 verbatim)
});
export type Track = z.infer<typeof Track>;

// 변경 — PlanItem.track: string → Track (정규화). 미분류 = null.
//   PlanItem = { ..., track: Track.nullable().default(null), ... }
// 변경 — GanttRow 에 track 추가:
//   GanttRow = { initiative, track: Track.nullable().default(null), bars, markers }
// 변경 — 그룹 순서(결정적): 세로 뷰 envelope 에 trackOrder(key 배열, profile 순서 + 미분류 last)
//   TimelineResponse += trackOrder: z.array(z.string()).default([])
//   PlanResponse     += trackOrder: z.array(z.string()).default([])
// BoardResponse = 변경 없음(칩만 — PlanItem.track 재사용).
```

## 정규화 규칙 (`normalizeTrack(raw, vocab) → Track | null`) — 결정적
입력 = ledger track 원문(`raw: string|null`) + 어휘(`vocab: Map<key,label>`, profile `## Tracks`; 없으면 빈 맵).
1. `raw` 가 null/공백 → **null**(미분류).
2. **클린**: `**`(볼드)·이모지·선행 `Track`(대소문자)·양끝 공백·후행 `🔴`류 마커 제거.
3. **key 추출**: 클린값이 `^([A-Z])\b` (선행 대문자 1자) → key=그 문자. 아니면 클린값이 어휘 label 과 일치 → 그 key. 아니면 key = 클린값 첫 토큰 slug.
4. **label 해소**: key ∈ vocab → **label = vocab[key]**(카노니컬 SoT). 아니면 label = 클린값에서 `key —`/`key -`/`key ` 접두 제거한 나머지(프로즈 fallback, verbatim). 나머지 빈값이면 label = key.
5. `{key, label}` 반환.
- **복수 track 표기 edge**(레거시 `A — 저장 spine / E — operator 트리`) = **선두 1개 채택**(key=A). 드문 레거시 — 결정적(항상 선두).
- **trackOrder**(세로 뷰): vocab 선언 순서의 key + (실사용 중 vocab 밖 key = indexOrder 최초등장 순 append) + 미분류(null-track) 있으면 마지막 `"__ungrouped__"` sentinel. 전부 결정적(SoT 순서/indexOrder).
  - 🔴 **단일 소유(DRY)** = 신규 순수 `project/track.ts` `computeTrackOrder(state): string[]` — **buildGantt·buildPlan 이 공유**(순서 로직 2벌 금지 = drift 방지; `partitionInitiatives` 추출 선례). 정규화도 여기서 batch(`normalizeTrack` 은 parse/track.ts 순수 함수, order 계산은 project/track.ts).

## 파싱 (`parseLedger` track — frontmatter 우선)
```
const { data, body } = frontmatter(content);        // gray-matter (기존)
const fmTrack   = str(data.track);                  // 카노니컬 "C"
const proseTrack = body.match(/^-\s*.*트랙:\s*([^·\n]+)/m)?.[1]?.trim();  // 레거시 fallback
info.track = fmTrack ?? proseTrack ?? null;         // 원문(정규화는 build 시 vocab 와)
```
`normalizeTrack` 은 build/projection 에서 vocab 와 함께 적용(parseLedger 은 per-file 순수라 vocab 없음).

## Reuse map
brief §재사용 map. 핵심 = 기존 projection 에 **축만 얹음**(buildPlan/Kanban/Gantt 재작성 X), seam 은 `KickoffEvent` 패턴 재사용.

## Test Strategy (컴포넌트별 verify)
- `web/contract`: `contract:check`(codegen rerun + diff 0).
- `web/core`: vitest —
  - `normalizeTrack`: 18변형 → 7 key 수렴(볼드·이모지·`Track ` 접두·`C —`/`C -` 변형·후행 🔴), 어휘 있음(label=vocab) vs 없음(프로즈 파생), null/공백=미분류, vocab-밖 key.
  - `parseProfileTracks`: `## Tracks` 표 → key↔label.
  - `parseLedger`: frontmatter `track:` 우선, 없으면 프로즈, 둘 다 없으면 null.
  - `buildGantt/buildKanban/buildPlan`: 정규화 track 부착 + trackOrder(순서 결정적, 미분류 last).
- `web/backend`: envelope 에 track/trackOrder 포함(app.test).
- `web/frontend`: vitest — 타임라인 그룹 레이아웃(좌 라벨 span + 행), hover co-highlight(그룹+행 class 토글), 리스트 섹션 헤더, 보드 track 칩. tsc.
- **회귀**: `pnpm verify`(78+) green + `mermaid-refs-check`.

## Operations 영향
없음(신규 명령 X — 기존 dev/verify 그대로).

## Task Breakdown (DAG)
> Files 경로 = Source layout code root(`code/web/`) 기준.

### T1 — CONTRACT: Track seam
- **Files**: `code/web/contract/src/index.ts`(+codegen 산출). **Produces**: `Track`, `PlanItem.track:Track`, `GanttRow.track`, `TimelineResponse/PlanResponse.trackOrder`. **acceptance**: `contract:check` green(codegen diff 0). **dep**: —

### T2 — CORE parse: 정규화 + 어휘 + frontmatter
- **Files**: `code/web/core/src/parse/track.ts`(신규 `normalizeTrack`·`parseProfileTracks`), `parse/ledger.ts`(track frontmatter 우선). **Consumes**: T1 `Track`. **Produces**: 순수 정규화 함수·어휘 파서. **acceptance**: vitest — 18변형 수렴·label 해소(vocab/프로즈)·미분류·frontmatter 우선. **dep**: T1

### T3 — CORE state/projection + core-io vocab
- **Files**: `state/model.ts`(`ProjectState.tracks: Map<string,string>`), `state/build.ts`, **신규 `project/track.ts`**(`computeTrackOrder(state)` — buildGantt·buildPlan 공유), `project/plan.ts`·`kanban.ts`·`gantt.ts`(정규화 track 부착 + trackOrder), `core-io/src/load.ts`(profile `## Tracks` 읽어 vocab). **Consumes**: T2. **Produces**: 정규화 track 붙은 PlanItem/GanttRow + trackOrder. **내부 형상**: `GanttResult`·plan 산출 반환에 `trackOrder: string[]` 추가(→ 백엔드 envelope 로 흐름). **acceptance**: vitest — build*/projection track+trackOrder(순서 결정적, 미분류 last) + core-io 가 profile vocab 로드(없으면 빈 맵→프로즈 fallback). **dep**: T2

### T4 — backend envelope
- **Files**: `code/web/backend/src/app.ts`(TimelineResponse/PlanResponse 에 trackOrder + rows/items track — projection 파생, 로직 X). **Consumes**: T3. **acceptance**: app.test — /api/timeline·/api/plan 에 track/trackOrder. **dep**: T3

### T5 — frontend 타임라인 그룹 레이아웃 + hover
- **Files**: `frontend/src/components/timeline/TimelineChart.tsx`(+ `TimelineView` trackOrder 소비), `lib/` 필요 시. **Consumes**: T4 TimelineResponse. **Produces**: 좌측 대분류 라벨 세로 span + `│` divider + 그 track sprint 라인들 · hover 시 행+그룹 라벨 co-highlight · 미분류 그룹 last. **acceptance**: vitest — 그룹 헤더/행 렌더(mock trackOrder+track), hover class 토글(그룹+행). wireframe 준수. dev 실렌더. **dep**: T4

### T6 — frontend 리스트 섹션 헤더 + 보드 칩
- **Files**: `frontend/src/components/plan/PlanView.tsx`(track 섹션 헤더, trackOrder 순), `board/BoardCard.tsx`(정규화 track 칩 `key label`). **Consumes**: T4. **acceptance**: vitest — 리스트 track 헤더 그룹핑 · 보드 카드 track 칩(원문 아닌 `{key,label}`). tsc. **dep**: T4

**DAG**: T1 → T2 → T3 → T4 → {T5, T6}(병렬 가능).

## 외부 의존
- **cling writer 규약**(이미 편집): `## Tracks` 어휘 + ledger `track:` frontmatter. gootte 는 **없어도 동작**(레거시 프로즈 fallback) — cling 정형화는 카노니컬 경로를 열 뿐, 이 phase 를 막지 않음(하이브리드).
