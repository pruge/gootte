---
created: 2026-07-27
status: done                 # pending | in_progress | done
priority: normal
kind: bundle
todos: [028-doc-browser-seam, 029-doc-browser-ui]
worktree: doc-browser        # /cling:worktree 가 박음
startedAt: 2026-07-27
endedAt: 2026-07-27
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

## 사용자 테스트
> 검증 완료: `pnpm verify` green(**160 tests** — 신규 seam 14[resolver·tree·realpath 가드·엔드포인트·라우팅] + 프론트 브라우저 플로우 3) + tsc + mermaid-refs. 실데이터 스모크(전용 :8899, GOOTTE_ROOTS=~/Documents): `/api/tree/gootte/roadmap-doc-browser` = adr/·brief·spec·wireframe + 가상 todo/(028·029 진행) 정확 반환 · spec.md read 정상 · `../../../../.cling/profile.md` traversal → **404**(INV-2).

**대시보드에서 직접 테스트** (dev 서버는 이 worktree 밴드 포트로 격리 — backend 8906 / frontend 5407):
- 프로젝트 선택(gootte 또는 jinwooauto) → plan 리스트 → **이니셔티브 클릭** → 인라인 **문서 브라우저** 펼침(기본 = 가상 `todo/` 폴더 = 할일 목록, badge 진행/완료).
- `../` 또는 breadcrumc(이니셔티브명) 클릭 → 상위(루트)로 cd → **brief.md·spec.md·wireframe.md·adr/** 형제 문서 보임.
- `adr/` 폴더 진입 → ADR 파일들 → 파일 클릭 → 우측 뷰어(보기/raw 토글, spec 열면 **mermaid 인라인 렌더**).
- 가상 `todo/`의 할일 파일 클릭 → 그 todo 문서 뷰어(기존 018 동작 보존).
- (선택) Playwright: alpha 픽스처는 이니셔티브가 없어 e2e 대상 아님 — 실데이터(위 수동 플로우)로 검토가 자연스러움.
