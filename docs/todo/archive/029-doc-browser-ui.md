---
created: 2026-07-27
status: done
completedAt: 2026-07-27
priority: normal
sprint: doc-browser
initiative: null          # gootte = blueprint 스타일(ledger 미선언) → related 로 연결
area: [web/frontend]
tags: [doc-viewer, ui, navigation]
related: [../roadmap/project-manager/roadmap-doc-browser/spec.md, 027-roadmap-doc-browser.md, 028-doc-browser-seam.md]
source: spec-decompose
---

# doc-browser-ui — FileBrowser(cd) + RoadmapItemRow 흡수 + DocDrawer 소스분기 (T4)

> spec-decompose (roadmap-doc-browser §Task Breakdown T4). 028 seam 소비.
> 실행 준비 완료(spec TBD-zero, kickoff-review BLOCK 0).

## T4 — FRONTEND FileBrowser + 통합
- Files: `code/web/frontend/src/components/plan/FileBrowser.tsx`(신규) · `.../RoadmapItemRow.tsx`(펼침 영역 교체) · `.../DocDrawer.tsx` + `lib/query.ts`(`useDoc` DocRef source 분기·`kind` 하드타입 제거) · `.../hooks/useTree.ts`(신규 query).
- **FileBrowser**: breadcrumb + 현재 path 자식 리스트(cd — `TreeResponse.nodes` 를 path prefix 로 필터, 클라이언트 네비 · ADR-0002). 기본 path=`todo`(= 현 체크리스트 UX). dir 클릭=진입, `../`/breadcrumb=상위. file 클릭=`DocRef` → DocDrawer.
- **RoadmapItemRow**: 펼침 영역을 체크리스트 → `FileBrowser` 로 교체(체크리스트는 가상 todo/ 폴더 뷰로 흡수, ADR-0001).
- **DocDrawer/useDoc**: `DocRef` source 별 read 엔드포인트 선택(roadmap=`/api/doc/:slug/roadmap/:init?path=`, todo/sprint=기존). `Markdown`/`MermaidBlock`/`ViewMode` 그대로 재사용. mermaid 는 문서 열 때 인라인 렌더.
- 가상 todo/ 노드 badge = 진행/완료(RoadmapItem status).

## 🔴 Invariant 점검
- **INV-3**(뷰=현재 SoT) — tree/content = TanStack Query, 기존 `useLiveSync`(파일변경 WS invalidation)가 무효화 → 재조회.
- **INV-2**(read-only) — 뷰어·브라우저 read only, 편집 UI 없음.

## acceptance
- 프론트 vitest: 기본 path=todo/ · cd(폴더 진입/상위·breadcrumb) · 파일 클릭 → DocDrawer 오픈 · roadmap 파일(spec.md) open · 체크리스트가 todo/ 폴더에 보임.
- Playwright e2e: 이니셔티브 클릭 → 브라우저 → 상위 cd → spec.md 열람(mermaid 인라인).
- `pnpm verify` green.

## 의존 / DAG
- dep: **028**(doc-browser-seam — TreeResponse/DocRef 계약 + `/api/tree`·`/api/doc(roadmap)` 엔드포인트 선행).
