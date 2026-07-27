---
created: 2026-07-27
status: in_sprint
priority: normal
sprint: doc-browser
initiative: null          # gootte = blueprint 스타일(ledger 미선언) → related 로 연결
area: [web/contract, web/core-io, web/backend]
tags: [doc-viewer, seam, contract]
related: [../roadmap/project-manager/roadmap-doc-browser/spec.md, 027-roadmap-doc-browser.md, 029-doc-browser-ui.md]
source: spec-decompose
---

# doc-browser-seam — tree 계약 + 폴더해소 + 나열/read + 엔드포인트 (T1·T2·T3)

> spec-decompose (roadmap-doc-browser §Task Breakdown). CONTRACT→CORE-IO→BACKEND 응집 seam.
> 실행 준비 완료(spec 이 TBD-zero 로 닫음, kickoff-review BLOCK 0).

## T1 — CONTRACT tree seam + DocKind 확장
- Files: `code/web/contract/src/index.ts` (+ codegen).
- `DocRef`(판별합집합 `{source:"roadmap",initiative,relPath}` | `{source:"todo"|"sprint",name}`)·`TreeNode`·`TreeResponse` zod + **`DocKind` 에 `"roadmap"` 추가**(DocResponse kind 확장, roadmap 시 name=relPath). `/cling:contract add` 로 SoT 반영, 손편집 X.
- acceptance: codegen diff 0 · tsc green · 기존 todo/sprint read 무회귀.

## T2 — CORE-IO 폴더해소 + tree 나열 + read 일반화
- Files: `code/web/core-io/src/tree.ts`(신규) · `code/web/core-io/src/doc.ts`(확장).
- `resolveInitiativeDir(repoPath, initiative): string|null` — `docs/roadmap/` **depth≤2** 스캔, basename===init + `spec.md|brief.md` 보유 폴더의 roadmap 상대경로. 결정적(정렬·첫 매치). epic 은 wire 에 안 실음.
- `listInitiativeTree(repoPath, initiative, roadmapItem): TreeNode[]` — resolver 폴더 파일 + `adr/` 열거 → file/dir 노드 + 가상 `todo/` dir + `roadmapItem.done/pending`(archive 포함) → todo 노드(pending 먼저→slug, badge 진행/완료). **`effInitiative` 재구현 금지**(RoadmapItem 재사용).
- `readDoc` roadmap 소스 = source 분기: `resolve(dir,relPath)` realpath `startsWith(dir)` 가드. todo/sprint basename 가드는 그대로.
- acceptance: vitest fixture — resolver 2-level 해소·동명 결정적·미존재 null · 노드 집합/정렬 · roadmap read 정상 · **realpath 이탈(`..`·절대·`.`선행) reject**.

## T3 — BACKEND 엔드포인트
- Files: `code/web/backend/src/app.ts`.
- `GET /api/tree/:slug/:initiative` = `buildRoadmap`(재사용)→그 item→`listInitiativeTree` → `TreeResponse`.
- `GET /api/doc/:slug/roadmap/:initiative?path=<relPath>` = `readDoc(roadmap)` → `DocResponse`.
- acceptance: app.test — tree 노드 반환(실파일+adr/+가상todo/) · roadmap content 반환 · **traversal 404** · 미존재 이니셔티브 404 · 기존 todo/sprint doc 무회귀.

## 🔴 Invariant 점검
- **INV-2**(read-only) — 나열·read 만, write 0. realpath 가드로 폴더 밖 차단.
- **INV-4**(결정적·LLM-free) — resolver 스캔·정렬·경로해소 순수. content raw 릴레이.
- **INV-1**(파생) — 가상 todo/ = RoadmapItem 파생(2차 SoT 없음).

## 의존 / DAG
- dep: 없음(seam 시작). T1 → T2 → T3 선형. 029(ui)가 이 seam 을 소비.

## 완료 기준
- `pnpm verify`(tsc + vitest) green + contract drift-guard(codegen diff 0) green.
