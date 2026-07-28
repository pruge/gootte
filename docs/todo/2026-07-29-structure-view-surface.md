---
created: 2026-07-29
status: in_progress
priority: normal
sprint: 2026-07-29-web-structure
initiative: web-structure
area: [web/backend, web/frontend]
tags: [mermaid, structure, view, board-removal]
related:
  - docs/roadmap/project-manager/web-structure/spec.md
  - 2026-07-29-structure-data-spine.md
source: spec-decompose
---

# 구조 뷰 surface — /api/structure 엔드포인트 · StructureView (보드 제거)

> web-structure spec §Task Breakdown T4·T5. 데이터 spine 위 표면 — 보드 슬롯을 track 인덱스→포커스 구조 뷰로 교체. **선행 = 구조 데이터 spine todo 완료.**

## T4 — backend: /api/structure (spec §T4)
- `code/web/backend/src/app.ts`: `/api/board/:slug` → `/api/structure/:slug` — `readMermaidDocs(p.repoPath)` + `buildStructure(raw, p.tracks, p.state.ledgers, p.indexOrder)` → `StructureResponse.parse`. `buildKanban` import 제거.
- **INV-3 점검**: web-realtime watch 글롭에 `docs/mermaid/**` 포함 여부 — 미포함이면 글롭 확장(그림 저장→라이브 갱신). 포함이면 no-op.
- acceptance: `/api/structure/:slug` 200 + parse 통과 · 제거된 `/api/board` 404 · `pnpm verify` green.

## T5 — frontend: StructureView + board 제거 (spec §T5)
- **신규** `components/structure/{StructureView,StructureIndex,DiagramFocus}.tsx` — 레이아웃 A([wireframe](../roadmap/project-manager/web-structure/wireframe.md)): `groupByTrack` track 인덱스(제목·상태칩) → 클릭 → `DiagramFocus` 가 `MermaidBlock code={diagram.code}` 렌더. empty·superseded(dimmed).
- **제거** `components/board/`(BoardView·BoardCard) · `lib/api.ts`·`lib/query.ts` board→structure(useStructure) · `components/main/MainPanel.tsx` PLAN_MODES `보드/board`→`구조/structure` + `planMode` 갱신.
- 스택 하드룰: Tailwind · Tabler(empty = `IconChartDots3`) · Pretendard.
- acceptance: vitest(RTL) — 인덱스 렌더·클릭 포커스 mount·empty·superseded dimmed. `tsc --noEmit` + vitest green.

## 의존
- 선행 = [구조 데이터 spine](2026-07-29-structure-data-spine.md)(T1·T2·T3). T4→T5.

## 관련
- spec = `docs/roadmap/project-manager/web-structure/spec.md` · wireframe · 그림 = [M-0007](../mermaid/INDEX.md#M-0007) · ADR-0003(칸반 교체).
- **Invariant**: INV-3(현재 SoT 반영 — watch 글롭)·INV-2(read-only).
