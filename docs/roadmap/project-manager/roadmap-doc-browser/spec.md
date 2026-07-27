# roadmap-doc-browser — spec (2e · W 트랙, TBD-zero)

## Goal
이니셔티브를 클릭하면 열리는 인라인 공간에서, 그 이니셔티브 폴더의 문서(brief·spec·adr·ledger·
wireframe)와 소속 할일을 **Unix 디렉토리(cd/ls)처럼 탐색·열람**한다. 기본 진입은 **가상 `todo/` 폴더**
(현 체크리스트 UX 무손실), 파일 클릭 시 기존 `DocDrawer` 로 연다. 전부 read-only·결정적(INV-2/4).

## Architecture
```
[관리대상 md SoT]              [CORE pure]          [CORE-IO fs]                    [CONTRACT]        [BACKEND Hono]          [FRONTEND React]
docs/roadmap/<epic>/<init>/ ─┐  buildRoadmap ──▶  resolveInitiativeDir(repo,init) ─┐               /api/tree/:slug/:init ──▶ FileBrowser(cd)
  brief·spec·adr/…            │  (RoadmapItem       (roadmap depth≤2 스캔·결정적)     ├▶ TreeNode/DocRef                        │ 파일 클릭
docs/todo/*.md (related) ─────┘   done/pending) ─▶  listInitiativeTree ─────────────┤  TreeResponse                            │
                                   (가상 todo/ 재사용)  (실파일+adr/+가상todo/)        │                                        ▼
                                                    readDoc(roadmap 소스, realpath 가드) ──────────▶ /api/roadmap-doc ──────▶ DocDrawer(재사용)
```
- **initiative→폴더 해소**(ADR-0004 §0): `resolveInitiativeDir` 가 유일 소유자 — epic 은 wire 에 안 실음(엔드포인트·DocRef 는 slug 만).
- **read-path 결정적**(INV-4): fs 열거 + 결정적 정렬 + 경로해소. LLM 0. cd 네비는 프론트가 받은 tree 안에서.
- **가상 todo/ = 기존 projection 재사용**: `buildRoadmap` 의 `RoadmapItem.done/pending`(archive 포함) — `effInitiative` 재구현 금지(INV-1 단일 소유).
- **seam = tree/read 계약**: 경계 넘는 `TreeNode`·`DocRef`·`TreeResponse` + `DocKind`+"roadmap" = CONTRACT(zod codegen) SoT → 소비처 파생.

## Components (영향/신규)
| 컴포넌트 | 변경 |
|---|---|
| `web/contract` | **신규** `TreeNode`·`DocRef`·`TreeResponse`(zod) + `DocKind`+"roadmap" 확장 + codegen |
| `web/core` | 변경 없음 — 가상 todo/ 는 기존 `buildRoadmap`/`RoadmapItem.done·pending` 재사용(신규 projection X) |
| `web/core-io` | **신규** `resolveInitiativeDir(repo, init)` + `listInitiativeTree(...)` + `readDoc` roadmap 소스(realpath 가드, source 분기) |
| `web/backend` | **신규** `GET /api/tree/:slug/:initiative`(buildRoadmap→item→list) + `/api/doc` roadmap 소스 |
| `web/frontend` | **신규** `FileBrowser`(cd) · `RoadmapItemRow` 체크리스트→가상 todo/ 흡수 · `DocDrawer`/`useDoc` DocRef source 분기 · `useTree` |

## Invariants (프로파일 해당분 verbatim)
- **INV-1** — projection(digest · render-data)은 관리대상 프로젝트의 md SoT 에서 재생성되는 파생물. 손 유지 2차 SoT 금지.
  - *지키는 법*: 가상 `todo/` 는 todo frontmatter(`effInitiative`)에서 매 요청 파생 — 별도 저장/미러 없음.
- **INV-2** — gootte 는 관리대상 프로젝트 문서를 읽기 전용. cling SoT 문서 절대 mutate X.
  - *지키는 법*: tree 나열·파일 read 만. write 경로 0. traversal 가드로 폴더 밖 접근도 차단.
- **INV-3** — 뷰·digest 는 항상 현재 SoT 반영(실시간 체크·재생성). stale 뷰 금지.
  - *지키는 법*: tree/content = TanStack Query, 기존 useLiveSync(파일변경 WS invalidation)가 무효화 → 재조회.
- **INV-4** — read-path(plan/lineage/digest 생성)는 결정적·LLM-free. 요약 말고 verbatim 릴레이.
  - *지키는 법*: 열거·정렬(status→priority, 파일명)·경로해소 전부 순수. 문서 content 는 raw 릴레이(요약 X).

## Scope / Non-goals
- **scope**: 인라인 cd 브라우저 · 이니셔티브 폴더 실제 파일 + `adr/` + 가상 `todo/`(archive done 포함) · DocDrawer 연결.
- **non-goal**: 참조 mermaid 폴더 탐색 · worktree 라이브 트리 · 브라우저 path URL 영속 · 파일 편집/생성(INV-2) · 검색.

## Data Model / Contracts (CONTRACT SoT — codegen, 손편집 X)
```ts
// @gootte/contract (zod) — 신규 + DocKind 확장
DocKind = "todo" | "sprint" | "roadmap";           // ← "roadmap" 추가 (기존 enum 확장)
DocRef =
  | { source: "roadmap"; initiative: string; relPath: string }   // 이니셔티브 폴더 상대경로 (resolveInitiativeDir 로 폴더 해소)
  | { source: "todo" | "sprint"; name: string };                  // 기존 readDoc basename
TreeNode = {
  name: string;                 // 표시명 (spec.md · adr · 016-graph-view.md)
  type: "file" | "dir";
  path: string;                 // 브라우저 논리경로 (spec.md · adr · adr/0001-x.md · todo · todo/016-graph-view.md)
  read?: DocRef;                // file 만 (dir 은 없음)
  badge?: string | null;        // 선택 — 가상 todo 노드 status(pending→진행/done→완료)
};
TreeResponse = { project: string; initiative: string; nodes: TreeNode[] };  // flat 리스트
// DocResponse 는 kind:DocKind(이제 roadmap 포함), roadmap 시 name=relPath·archived=false·worktree 없음.
```
- **initiative→폴더 해소**: core-io `resolveInitiativeDir(repoPath, initiative): string|null` — `docs/roadmap/` **depth ≤2** 스캔, basename===initiative + `spec.md|brief.md` 보유 폴더의 roadmap 상대경로. 결정적(정렬·첫 매치). epic 은 wire 에 안 실음.
- **read 확장**: `/api/roadmap-doc/:slug/:initiative?path=<relPath>` (roadmap 소스 — generic doc 라우트 충돌 회피 별도 경로). 기존 `/api/doc/:slug/:kind/:name`(todo/sprint) 유지.
- **traversal 가드**(readDoc roadmap, source 분기): `dir=resolveInitiativeDir` → `resolve(dir, relPath)` 의 **realpath 가 `dir` 로 startsWith** 여야 함(`..`·절대·`.`선행 차단). todo/sprint 는 기존 `basename` 가드 유지(한 함수에 두 모델 혼재 X, source 로 분기).
- **가상 `todo/`**: `buildRoadmap` 의 그 initiative `RoadmapItem.done[]`/`pending[]`(archive done 포함) 재사용 → `todo/<slug>.md` 노드. `effInitiative` 재구현 금지.

## 데이터 SoT 소유권
- todo 상태·소속 = 각 todo frontmatter(`status`·`related`) — SoT. 가상 todo/ 노드는 `RoadmapItem`(read-time 파생)에서 파생(write-owner 없음, 2차 SoT 없음).
- initiative→폴더 = `resolveInitiativeDir` 단일 소유(fs 진실에서 매 요청 해소). 파일 content = 관리대상 md — gootte read-only 소비자(INV-2).

## Reuse map
brief §재사용 map 참조. 신규 = tree 나열(core-io) · read 일반화(core-io) · FileBrowser(frontend) · contract 타입. 뷰어·effInitiative·live·query = 재사용.

## Test Strategy (컴포넌트별 verify = 프로파일 verify 맵)
- **contract**: codegen rerun → git diff 0(drift-guard, verify 포함) + tsc. DocKind+"roadmap" 확장 후 기존 todo/sprint read 무회귀.
- **core**: 변경 없음 — 가상 todo/ 는 `buildRoadmap`/`RoadmapItem` 재사용(기존 roadmap.test 커버). 신규 core 유닛 없음.
- **core-io**: `resolveInitiativeDir` 2-level 폴더 해소·동명 결정적·미존재 null. `listInitiativeTree` — 실제 fixture 폴더에서 노드 집합(spec.md·adr/*·가상 todo/<slug>) + 정렬 검증. `readDoc` roadmap 소스 정상 read + **realpath 이탈(`..`·절대·`.`선행) reject** unit.
- **backend**: app.test — `GET /api/tree/:slug/:init` 노드 반환 · `GET /api/doc roadmap` content 반환 · traversal 404 · 미존재 이니셔티브 404.
- **frontend**: FileBrowser 네비 — 기본 path=todo/ · 폴더 진입/상위(breadcrumb) · 파일 클릭 → DocDrawer 오픈(roadmap read) · 체크리스트가 todo/ 폴더에 보임. + Playwright e2e(이니셔티브 클릭 → 브라우저 → spec.md 열람).
- 전체: `pnpm verify`(tsc + vitest) green + mermaid-refs-check(문서 참조).

## Operations 영향
없음(신규 install/run/connect 명령 없음 — 기존 dev:backend/dev:frontend·verify 그대로). 프로파일 Operations 무갱신.

## Task Breakdown (DAG)

> Files 경로 = 프로파일 Source layout(`code/web/<comp>/`) 기준. CORE 신규 없음(가상 todo/ = RoadmapItem 재사용).

### T1 — CONTRACT tree seam + DocKind 확장  *(dep: 없음)*
- Files: `code/web/contract/src/index.ts` (+ codegen 산출).
- Produces: `DocRef`(판별합집합)·`TreeNode`·`TreeResponse` zod + **`DocKind` 에 `"roadmap"` 추가**(DocResponse 는 kind 만 넓어짐 — roadmap 시 name=relPath). Consumes: 기존 `DocKind`·`DocResponse`·`RoadmapItem`.
- acceptance: `/cling:contract add` 후 `pnpm --filter @gootte/contract codegen` diff 0 · tsc green · 기존 todo/sprint read 무회귀.

### T2 — CORE-IO 폴더해소 + tree 나열 + read 일반화  *(dep: T1)*
- Files: `code/web/core-io/src/tree.ts`(신규) `resolveInitiativeDir(repoPath, initiative)` + `listInitiativeTree(repoPath, initiative, roadmapItem)`; `code/web/core-io/src/doc.ts`(확장) roadmap 소스 read(source 분기).
- 로직: `resolveInitiativeDir` = `docs/roadmap/` depth≤2 스캔(basename===init + spec/brief), 결정적 첫 매치. `listInitiativeTree` = 그 폴더 파일 + `adr/` 열거 → TreeNode(file/dir) + 가상 `todo/` dir + `roadmapItem.done/pending` → todo 노드(pending 먼저→slug, badge). `readDoc` roadmap: `resolve(dir, relPath)` realpath `startsWith(dir)` 가드; todo/sprint basename 가드는 별도 분기.
- acceptance: vitest fixture — `resolveInitiativeDir` 2-level 폴더 해소·동명 결정적 · 노드 집합/정렬 · roadmap read 정상 · **`..`·절대경로·`.`선행 realpath 이탈 reject** · 미존재 init null.

### T3 — BACKEND 엔드포인트  *(dep: T2)*
- Files: `code/web/backend/src/app.ts`.
- 로직: `GET /api/tree/:slug/:initiative` = `buildRoadmap`(재사용)→그 item→`listInitiativeTree` → TreeResponse. `GET /api/roadmap-doc/:slug/:initiative?path=` = `readDoc(roadmap)` → DocResponse.
- acceptance: app.test — tree 노드 반환(실파일+adr/+가상todo/) · roadmap content 반환 · **traversal 404** · 미존재 이니셔티브 404 · 기존 todo/sprint doc 무회귀.

### T4 — FRONTEND FileBrowser + 통합  *(dep: T3)*
- Files: `code/web/frontend/src/components/plan/FileBrowser.tsx`(신규) · `.../RoadmapItemRow.tsx`(펼침 영역 교체) · `.../DocDrawer.tsx`+`lib/query.ts`(`useDoc` DocRef source 분기, `kind` 하드타입 제거) · `.../hooks/useTree.ts`(신규 query).
- 로직: breadcrumb + 현재 path 자식 리스트(cd, path prefix 필터, 클라이언트) · 기본 path=`todo` · 파일 클릭 = `DocRef` → DocDrawer(roadmap/todo/sprint 소스별 read) · 체크리스트를 todo/ 폴더 뷰로 흡수.
- acceptance: 프론트 vitest(기본 todo/·cd·breadcrumb·파일→drawer·roadmap 파일 open) + Playwright e2e(이니셔티브 클릭→브라우저→spec.md 열람).

**DAG**: T1 → T2 → T3 → T4 (선형 — seam 우선, 각 단계가 다음의 계약/데이터를 닫음).

## 외부 의존
없음(신규 npm 패키지 0 — fs·기존 zod/Hono/React/TanStack Query 재사용).

## 분해 → todo (Stage 3)
- **028 doc-browser-seam** = T1+T2+T3 (CONTRACT→CORE-IO→BACKEND 응집 seam — 계약·폴더해소·나열·read·엔드포인트).
- **029 doc-browser-ui** = T4 (FileBrowser cd + RoadmapItemRow 흡수 + DocDrawer/useDoc 소스분기 + 테스트/Playwright). dep: 028.
