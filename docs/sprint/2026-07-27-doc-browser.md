---
created: 2026-07-27
status: pending              # pending | in_progress | done
priority: normal
kind: bundle
todos: [028-doc-browser-seam, 029-doc-browser-ui]
worktree: null              # /cling:worktree 가 박음
startedAt: null
endedAt: null
related_sprints: []
---

# doc-browser — 이니셔티브 Unix 디렉토리형 문서 브라우저 (seam → ui)
> bundle. 1 worktree = 1 sprint. roadmap-doc-browser(2e) spec 실행.

## scope
- 028-doc-browser-seam (normal) — CONTRACT(TreeNode/DocRef/TreeResponse + DocKind+"roadmap") → CORE-IO(resolveInitiativeDir·listInitiativeTree·readDoc roadmap 소스) → BACKEND(`/api/tree`·`/api/doc(roadmap)`).
- 029-doc-browser-ui (normal) — FileBrowser(cd) + RoadmapItemRow 체크리스트→가상 todo/ 흡수 + DocDrawer/useDoc source 분기 + 테스트/Playwright.

## 🔴 Invariant 점검 (프로파일 Invariants 중 이 sprint 에 걸리는 것)
- **INV-2** (read-only) — 트리 나열·파일 read 만. write 0. roadmap read realpath 가드로 이니셔티브 폴더 밖 차단.
- **INV-4** (read-path 결정적·LLM-free) — resolveInitiativeDir 스캔·정렬·경로해소 순수. content raw 릴레이(요약 X).
- **INV-1** (projection = md SoT 파생) — 가상 todo/ = buildRoadmap/RoadmapItem 파생(2차 SoT 없음, effInitiative 재구현 X).
- **INV-3** (뷰 = 현재 SoT) — tree/content = TanStack Query, 기존 useLiveSync(WS invalidation) 재조회.

## 묶음 근거
- 같은 feature 의 선형 체인 — seam(contract→core-io→backend) 을 029 ui 가 소비. 한 worktree 에서 seam→ui 순차 구현 후 통합 verify·머지(solo). seam 단독 머지 = 사용자 비가시 반쪽.

## 작업 path (예상 phase)
### Phase 1 — 028 seam (T1→T2→T3, 선형)
- T1 CONTRACT(`/cling:contract add` → codegen) → T2 CORE-IO(resolver·tree·read) → T3 BACKEND(엔드포인트 + app.test).
### Phase 2 — 029 ui (T4)
- FileBrowser + RoadmapItemRow 교체 + DocDrawer/useDoc source 분기 + 프론트 테스트 + Playwright e2e.

## 다음 단계 결정 필요
- 없음(spec TBD-zero + kickoff-review BLOCK 0 로 닫힘).

## 완료 기준
- 028: `pnpm verify`(tsc+vitest) green + contract drift-guard(codegen diff 0) · app.test(tree/roadmap read·traversal 404·무회귀).
- 029: 프론트 vitest(기본 todo/·cd·breadcrumb·파일→drawer·roadmap open) + Playwright e2e(이니셔티브→브라우저→spec.md 열람).
- 전체 회귀: 대시보드에서 이니셔티브 클릭 → 인라인 브라우저(기본 todo/) → 상위 cd → brief/spec/adr 열람(mermaid 인라인).
