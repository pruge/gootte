# ADR-0004: 단일 tree 엔드포인트 + 경로기반 read 일반화 + 가상 todo/ 합성

Status: accepted
Date: 2026-07-27 / 관련: spec.md §Data Model / Contracts, §Task Breakdown

## Context
브라우저는 ① 이니셔티브 폴더 트리 나열 ② 임의 파일 read 가 필요하다. 기존 `readDoc` 은
`kind∈{todo,sprint}` 고정폴더 + **basename 만**(서브폴더 `adr/0001.md` 불가). 폴더는 얕다(ADR-0003).

## Decision
**A) tree 1회 반환 + 경로기반 read + initiative→폴더 결정적 해소.**

0. **🔴 initiative → 폴더 주소해소(BLOCK 수리)** — gootte 실제 레이아웃은 2-level `docs/roadmap/<epic>/<init>/`
   이고, blueprint fallback 으로 오는 initiative 는 **slug 만**(state·ledger 에 폴더경로·epic 없음, `load.ts` 는
   1-level epic 만 순회). 그러므로 **core-io `resolveInitiativeDir(repoPath, initiative): string | null`** 이
   `docs/roadmap/` 를 **depth ≤2** 로 스캔해 basename===`initiative` 이며 `spec.md`|`brief.md` 를 가진 폴더의
   **roadmap 상대경로**(예 `project-manager/roadmap-doc-browser`)를 반환한다. 결정적(정렬 스캔·첫 매치),
   못 찾으면 null(404). **epic 은 wire 에 싣지 않는다** — 엔드포인트·`DocRef` 는 `initiative` slug 만 나르고
   서버가 이 resolver 로 폴더를 얻는다(단일 소유자 = resolver). 동명 initiative 충돌은 결정적 첫 매치 + acceptance 로 고정.
1. **tree 엔드포인트** — `GET /api/tree/:slug/:initiative` → `TreeResponse { project, initiative, nodes: TreeNode[] }`.
   `nodes` = **flat 리스트**(각 노드 = `path`(브라우저 논리경로)·`type`(file|dir)·`name` + file 은 `read: DocRef`).
   프론트는 path prefix 로 자식 필터해 cd(ADR-0002). 서버: `resolveInitiativeDir` → 실제 파일 + `adr/` 열거 + 가상 `todo/`.
2. **경로기반 read 일반화** — `readDoc` 에 **roadmap 소스** 추가: `resolveInitiativeDir` 로 얻은 폴더 기준 상대경로
   (`spec.md`·`adr/0001-x.md`)를 read. **traversal 가드** = `resolve(dir, relPath)` 의 **realpath 가 dir 로 startsWith**
   여야 함(정규화 후 폴더 밖=`..`·절대·`.`선행 차단). 기존 `todo/sprint` **basename 가드는 그대로 별도 분기**(가상 todo/ 열기 재사용) —
   두 안전모델을 source 로 분기(한 함수에 혼재 금지).
3. **가상 `todo/` 합성 = 기존 projection 재사용** — `effInitiative`(build.ts private closure, 미export) **재구현 금지**.
   대신 backend 가 이미 쓰는 `buildRoadmap` 의 그 initiative `RoadmapItem` 의 `done[]`/`pending[]`(archive done 포함, INV-1 파생)
   으로 `todo/<slug>.md` 노드 생성(`read: {source:"todo", name}`, badge = pending→진행/done→완료). 정렬 = pending 먼저 → slug.

`TreeNode.read` = `DocRef` 판별합집합: `{source:"roadmap", initiative, relPath}` | `{source:"todo"|"sprint", name}`
→ 프론트가 소스별 read 엔드포인트 선택(roadmap = `/api/roadmap-doc/:slug/:initiative?path=...`(generic doc 라우트 충돌 회피), todo/sprint = 기존 `/api/doc/:slug/:kind/:name`).
**`DocKind` 에 `"roadmap"` 추가** + `DocResponse`(roadmap 시 `name`=relPath·`archived`=false)로 read 응답 통일 → 프론트 `useDoc`/`DocDrawer` 는 `kind`/`DocRef` source 분기로 확장(하드타입 `"todo"|"sprint"` 제거).

## Alternatives
- **B) 레벨별 lazy 나열**(`?path=adr`) — 진짜 cd 처럼 레벨마다 fetch. 얕은 폴더엔 왕복만 늘고 과설계.

## Consequences
- 신규 공유 타입 `TreeNode`·`DocRef`·`TreeResponse` = CONTRACT(zod codegen) — 구현 전 `/cling:contract add`(손편집 X).
- `readDoc` 시그니처 확장(roadmap 소스) — 기존 호출부(todo/sprint) 무회귀(소스 판별).
- 트리 나열은 순수 fs 열거 + 결정적 정렬(INV-4). 요청 1회(폴더 얕음).

## Invariant impact
- **INV-2**(read-only) — tree 나열 + read 전부 read. write 0. 유지.
- **INV-4**(결정적·LLM-free) — 열거·정렬·경로해소 순수. LLM 0. 유지.
- **INV-1**(projection=md SoT) — 가상 todo/ 는 todo frontmatter 에서 파생(effInitiative), 2차 SoT 없음.
- **INV-3**(뷰=현재 SoT) — tree·content 는 TanStack Query 재조회 + 기존 live invalidation(파일변경 WS)로 최신.

## Contract impact
**있음** — `TreeNode`·`DocRef`(판별합집합)·`TreeResponse` zod 스키마 신규 + codegen. `/cling:contract add` 로 SoT 반영.
기존 `DocKind`·`DocResponse` 재사용/확장(roadmap 소스). 손편집 금지, drift-guard(verify) 포함.
