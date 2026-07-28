# spec — web-structure (project-manager phase · TBD-zero)

> 부모 = [blueprint](../blueprint.md) · brief = [brief.md](brief.md) · 그림 = [M-0007](../../../mermaid/INDEX.md#M-0007).
> plan "보드" 슬롯을 칸반 → **저작 `docs/mermaid/` 구조 뷰**로 교체. 소스=저작(ADR-0001)·track=sources 파생(ADR-0002)·칸반 완전 교체(ADR-0003).

## Goal
관리대상 프로젝트의 `docs/mermaid/` 저작 다이어그램을 **track 별로** 대시보드에 렌더 — 리스트와 동축으로 훑고, 클릭하면 그림 크게. 순수·결정적·읽기 전용.

## Architecture (데이터 흐름 — [M-0007](../../../mermaid/INDEX.md#M-0007))
```
docs/mermaid/*.md (프로젝트, read-only INV-2)
  └ core-io: readMermaidDocs(repoPath) → RawMermaidDoc[]  (파일 raw + 경로, INDEX.md 제외)
      └ core: buildStructure(raw, tracks, initiatives, order) → StructureGroup[]  (순수 INV-4)
          · parseMermaid(fm) → id·title·status·supersedes·supersededBy·**sources**
          · extractMermaidBlock(body) → 첫 ```mermaid 코드 (없으면 그림 제외)
          · deriveTrack(sources, initiatives) → Track|null   (ADR-0002)
          · group(trackOrder) · sort(그룹=시스템→trackOrder→미분류, 내부=M-ID asc)
              └ contract: StructureResponse
                  └ backend: GET /api/structure/:slug
                      └ frontend: StructureView (track 인덱스 → 클릭 → MermaidBlock 포커스)
```

## Components (영향/신규)
| 컴포넌트 | 변경 |
|---|---|
| `web/contract` | **신규** `StructureDiagram·StructureGroup·StructureResponse` · **제거** `BoardResponse·KanbanColumn` |
| `web/core` | **신규** `project/structure.ts` `buildStructure` · `parse/mermaid.ts` 에 `sources` 파싱 + `extractMermaidBlock` · **제거** `project/kanban.ts`(+test). `partition.ts` 보존 |
| `web/core-io` | **신규** `mermaid.ts` `readMermaidDocs(repoPath)` |
| `web/backend` | `/api/board`→`/api/structure` (app.ts). `buildKanban` import 제거 |
| `web/frontend` | **신규** `components/structure/{StructureView,StructureIndex,DiagramFocus}.tsx` · **제거** `components/board/`. `lib/{api,query}` board→structure. `main/MainPanel` 뷰모드 라벨/id |

## Invariants (프로파일 해당분)
- **INV-2** (read-only) — `readMermaidDocs` 는 read 전용. gootte write = `.gootte/` 밖 0. **지킴 = core-io fs read 만, 쓰기 API 미호출.**
- **INV-3** (항상 현재 SoT) — 매 요청 시 파일 재read(캐시 stale 금지). web-realtime watch 대상에 `docs/mermaid/` 포함 확인(하단 Operations).
- **INV-4** (결정적·LLM-free) — `buildStructure` 순수 함수, 입력 동일→출력 동일. LLM 미개입.

## Scope / Non-goals
- **IN**: 위 Components. 그림 없는 프로젝트 = empty 상태. superseded 그림 = 표시(⚫, dimmed), 숨김 X(이력 가치).
- **Non-goal**: import 자동추출 · 노드 클릭→문서 이동 · 그림 편집 · 자동 골격 생성 · 다중 track 그림(첫 해소 track 사용).

## Data Model / Contracts (seam — `@gootte/contract`)
```ts
// 신규 (codegen SoT)
export const StructureDiagram = z.object({
  id: z.string(),                 // M-NNNN
  title: z.string(),
  status: z.enum(["living", "superseded"]),
  code: z.string(),               // 추출된 ```mermaid 블록(순수 렌더 소스)
  sources: z.array(z.string()).default([]),  // frontmatter sources (드릴 링크 future)
});
export const StructureGroup = z.object({
  track: Track.nullable().default(null),  // null = 시스템/공통 (ADR-0002)
  diagrams: z.array(StructureDiagram),
});
export const StructureResponse = z.object({
  project: z.string(),
  groups: z.array(StructureGroup),
  trackOrder: z.array(z.string()).default([]),  // 그룹 순서(시스템=sentinel first) — groupByTrack 재사용
});
// 제거: BoardResponse · KanbanColumn (ADR-0003)
```
- **SoT 소유권**: 그림 원본 = 프로젝트 `docs/mermaid/`(gootte read-only). `StructureResponse` = 파생물(INV-1), 손유지 2차 SoT 없음.

## Reuse map
brief §재사용 map. 핵심: `MermaidBlock`(렌더)·`parseMermaid`(fm, sources 추가)·`groupByTrack`+`trackOrder`·core-io `load`(repoPath·tracks·initiatives).

## Test Strategy (컴포넌트별 verify)
- `contract`: codegen 재실행 diff 0(`pnpm --filter @gootte/contract codegen`).
- `core`: vitest — `extractMermaidBlock`(블록 有/無/복수→첫째) · `deriveTrack`(이니셔티브 매칭/횡단 null/다중 첫해소) · `buildStructure`(그룹 순서=시스템 first·trackOrder·미분류 last, 내부 M-ID asc, superseded 포함, 코드 없는 그림 제외). fixture = jinwooauto `docs/mermaid/`(실데이터) + gootte 자체.
- `core-io`: vitest fixture — `readMermaidDocs` 가 `*.md` 읽고 `INDEX.md` 제외 · 미존재 폴더→`[]`.
- `backend`: `/api/structure/:slug` 200 + StructureResponse.parse 통과. 제거된 `/api/board` 404 회귀.
- `frontend`: vitest(RTL) — track 인덱스 렌더 · 항목 클릭→포커스 그림 mount · empty(그림 0) 상태 · superseded dimmed. `tsc --noEmit`.
- **전체 회귀**: `pnpm verify`(tsc + vitest). mermaid refs drift-guard(`bash scripts/mermaid-refs-check.sh`).

## Operations 영향
- 신규 install/run/connect 명령 **없음**. 기존 `pnpm dev`·`pnpm verify` 그대로.
- **INV-3 확인 항목**: web-realtime `watchProjects`(chokidar) 감시 글롭에 `docs/mermaid/**` 가 포함되는지 점검 — 안 되면 T4 에서 글롭 확장(그림 저장 시 대시보드 라이브 갱신). 포함이면 no-op.

## Task Breakdown

### T1 — contract: Structure 타입 + Board 제거
- Files: `code/web/contract/src/index.ts` (+ codegen 산출)
- Consumes: `Track`. Produces: `StructureDiagram·StructureGroup·StructureResponse`. 제거: `BoardResponse·KanbanColumn`.
- acceptance: codegen 재실행 diff 0. `KanbanColumn` grep 0(소비처 T3·T4·T5 에서 함께 제거).
- 의존: 없음(선행).

### T2 — core-io: readMermaidDocs
- Files: `code/web/core-io/src/mermaid.ts`(신규) · `index.ts`(export)
- Interface: `readMermaidDocs(repoPath: string): RawMermaidDoc[]` where `RawMermaidDoc = { file: string; content: string }`. `join(repoPath,"docs/mermaid")` 하위 `*.md` 중 `INDEX.md` 제외, 없으면 `[]`.
- acceptance: vitest fixture — 파일 수집·INDEX 제외·미존재 `[]`.
- 의존: 없음(선행, T1 병렬 가능).

### T3 — core: buildStructure + parse 확장 + kanban 제거
- Files: `code/web/core/src/project/structure.ts`(신규) · `parse/mermaid.ts`(`sources` 파싱 + `extractMermaidBlock`) · **제거** `project/kanban.ts`·`kanban.test.ts` · `project/index.ts`(kanban export 제거)
- Interface: `buildStructure(raw: RawMermaidDoc[], tracks: Map<string,string>, initiatives: Ledger[], indexOrder: string[]): { groups: StructureGroup[]; trackOrder: string[] }`. 순수. 코드 블록 없는 그림 제외. track = `deriveTrack(sources, initiatives)`(sources 경로 `roadmap/<slug>` → initiative.track 정규화, 없으면 null).
- acceptance: §Test Strategy core 전부. `partition.ts` 무변경(buildPlan 회귀 green).
- 의존: T1(타입) · T2(RawMermaidDoc).

### T4 — backend: /api/structure
- Files: `code/web/backend/src/app.ts`
- 변경: `/api/board/:slug` → `/api/structure/:slug` — `readMermaidDocs(p.repoPath)` + `buildStructure(raw, p.tracks, p.state.ledgers, p.indexOrder)` → `StructureResponse.parse`. `buildKanban` import 제거. INV-3: watch 글롭에 `docs/mermaid/**` 포함 점검(Operations).
- acceptance: §Test Strategy backend. `pnpm verify` green.
- 의존: T1·T2·T3.

### T5 — frontend: StructureView + board 제거
- Files: `code/web/frontend/src/components/structure/{StructureView,StructureIndex,DiagramFocus}.tsx`(신규) · **제거** `components/board/` · `lib/api.ts`·`lib/query.ts`(board→structure) · `components/main/MainPanel.tsx`(PLAN_MODES `보드/board`→`구조/structure` · `planMode` 갱신) · `components/main/ViewMode` 무변경
- 렌더: 레이아웃 A(wireframe) — `groupByTrack` 로 track 인덱스(제목·상태칩) → 클릭 → `DiagramFocus` 가 `MermaidBlock code=diagram.code` 렌더. empty·superseded(dimmed) 처리. 스택 = Tailwind·Tabler·Pretendard(하드룰).
- acceptance: §Test Strategy frontend. `tsc --noEmit` + vitest green.
- 의존: T1·T4.

### 의존 DAG
```
T1 ─┐
T2 ─┼→ T3 → T4 → T5
     (T1·T2 병렬 · T3 대기)
```

## 외부 의존
없음 — 새 라이브러리·서버·명령 0. 기존 `mermaid`(MermaidBlock)·`zod`·`hono`·TanStack Query 재사용.
