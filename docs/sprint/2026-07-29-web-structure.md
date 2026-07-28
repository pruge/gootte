---
created: 2026-07-29
status: in_progress
priority: normal
kind: bundle
todos: [2026-07-29-structure-data-spine, 2026-07-29-structure-view-surface]
worktree: web-structure
startedAt: 2026-07-29
related_sprints: []
---

# web-structure — 보드를 저작 docs/mermaid 구조 뷰로 교체
> 묶음. 1 worktree = 1 sprint. 데이터 spine → 뷰 surface end-to-end.

## scope
- `2026-07-29-structure-data-spine` (normal) — contract 타입 + core-io `readMermaidDocs` + core `buildStructure` (칸반 `buildKanban` 제거)
- `2026-07-29-structure-view-surface` (normal) — `/api/structure` 엔드포인트 + `StructureView`(track 인덱스→포커스) + board 뷰 제거

## 🔴 Invariant 점검
- **INV-2 (read-only)** — `readMermaidDocs` 는 `docs/mermaid/` **읽기만**. gootte write = `.gootte/` 밖 0. 위반 위험 = fs write 호출 → 없음(read API 만).
- **INV-3 (현재 SoT 반영)** — 매 요청 파일 재read + web-realtime watch 글롭에 `docs/mermaid/**` 포함 확인(T4). stale 뷰 금지.
- **INV-4 (결정적·LLM-free)** — `buildStructure` 순수 함수(입력 동일→출력 동일). LLM 미개입.

## 묶음 근거
- **dependency (강)**: T4(엔드포인트 스왑)가 T3(칸반 제거)와 커플링 — 분리 머지 시 `/api/board` 가 삭제된 `buildKanban` 참조 → broken main. 동반 랜딩 필수.
- **domain (강)**: 단일 기능(web-structure) end-to-end. surface 는 spine 없이 무의미(빈 뷰).

## 작업 path (예상 phase)
### Phase 1 — 데이터 spine (spine todo · T1→T2→T3)
- T1 contract: `StructureDiagram·StructureGroup·StructureResponse` 신규 + `BoardResponse·KanbanColumn` 제거 → codegen diff 0.
- T2 core-io: `readMermaidDocs(repoPath)` (+ vitest fixture).
- T3 core: `buildStructure` + `parseMermaid` 확장(`sources`·`extractMermaidBlock`) + `kanban.ts`/test 제거. `partition.ts` 보존(buildPlan 회귀).

### Phase 2 — 뷰 surface (surface todo · T4→T5)
- T4 backend: `/api/board`→`/api/structure`. `buildKanban` import 제거. INV-3 watch 글롭 점검.
- T5 frontend: `components/structure/*` 신규(레이아웃 A) + `board/` 제거 + api/query board→structure + MainPanel 뷰모드 `보드/board`→`구조/structure`.

## 다음 단계 결정 필요
- 없음 (spec 이 닫음 — ADR-0001·0002·0003, TBD-0).

## 완료 기준
- spine 완료: `pnpm --filter @gootte/contract codegen` diff 0 · core/core-io vitest green · `KanbanColumn`/`buildKanban` grep 0(소비처 포함).
- surface 완료: `/api/structure/:slug` 200 + `StructureResponse.parse` 통과 · `/api/board` 404 · frontend `tsc --noEmit` + vitest green.
- **전체 회귀**: `pnpm verify`(tsc + vitest 전체) green · `bash scripts/mermaid-refs-check.sh` 무결 · plan 탭 "구조" 모드에서 track 별 그림 인덱스 렌더 + 클릭 포커스 + empty 상태.

## 사용자 테스트
> 변경 layer = web/frontend + web/backend. 이 worktree 밴드 포트: backend `8909` / frontend `5410`.

```bash
# worktree 안에서 dev 서버 (user-runs)
cd .claude/worktrees/web-structure && pnpm dev
# → frontend http://localhost:5410
```

- [ ] plan 탭 → 뷰모드에 **"보드" 대신 "구조"** 세그먼트 (리스트 / 구조 / 타임라인)
- [ ] "구조" 클릭 → 좌측에 **track 별** 다이어그램 인덱스(시스템/공통 → E → W …, 리스트 사이드바와 동축)
- [ ] 항목 클릭 → 우측에 해당 mermaid **그림 렌더**(테마 반영)
- [ ] `superseded` 그림 = dimmed·⚫ 표시
- [ ] 그림 있는 프로젝트(jinwooauto=52장·6그룹, gootte=7장·3그룹) 정상 · 없는 프로젝트 → "저작된 구조 다이어그램이 없습니다" empty
- [ ] (회귀) 리스트·타임라인·lineage 탭 정상 · "보드"·칸반 완전히 사라짐

> ✅ 자동 검증 완료: `pnpm verify`(tsc -r + vitest **181** green) · mermaid drift-guard 무결 · 실 엔드포인트 스모크(gootte/jinwooauto 200·track 그룹핑 확인).

## 관련 todo / spec
- [structure-data-spine](../todo/2026-07-29-structure-data-spine.md) — 순수/IO 척추
- [structure-view-surface](../todo/2026-07-29-structure-view-surface.md) — 엔드포인트 + 뷰
- spec = `docs/roadmap/project-manager/web-structure/spec.md` · 그림 = [M-0007](../mermaid/INDEX.md#M-0007)
