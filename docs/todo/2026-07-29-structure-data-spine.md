---
created: 2026-07-29
status: in_progress
priority: normal
sprint: 2026-07-29-web-structure
initiative: web-structure
area: [web/contract, web/core-io, web/core]
tags: [mermaid, structure, projection, kanban-removal]
related:
  - docs/roadmap/project-manager/web-structure/spec.md
  - 2026-07-29-structure-view-surface.md
source: spec-decompose
---

# 구조 데이터 spine — contract 타입 · core-io read · core buildStructure (칸반 제거)

> web-structure spec §Task Breakdown T1·T2·T3. 저작 `docs/mermaid/` → 결정적 `StructureResponse` 까지의 순수/IO 척추. 실행 준비 완료(spec 이 닫음).

## T1 — contract (spec §T1)
- `code/web/contract/src/index.ts`: **신규** `StructureDiagram·StructureGroup·StructureResponse`(spec §Contracts verbatim) · **제거** `BoardResponse·KanbanColumn`.
- acceptance: codegen 재실행 diff 0(`pnpm --filter @gootte/contract codegen`). `KanbanColumn`·`BoardResponse` grep = 이 todo 이후 core/backend/frontend 소비처만 남음(T4·T5 에서 제거).

## T2 — core-io: readMermaidDocs (spec §T2)
- `code/web/core-io/src/mermaid.ts`(신규) + `index.ts` export.
- `readMermaidDocs(repoPath): RawMermaidDoc[]` — `docs/mermaid/*.md` 중 `INDEX.md` 제외, 미존재 폴더 `[]`.
- acceptance: vitest fixture — 수집·INDEX 제외·미존재 `[]`.

## T3 — core: buildStructure + parse 확장 + kanban 제거 (spec §T3)
- `code/web/core/src/project/structure.ts`(신규) · `parse/mermaid.ts`(`sources` 파싱 + `extractMermaidBlock`) · **제거** `project/kanban.ts`·`kanban.test.ts` + `project/index.ts` kanban export.
- `buildStructure(raw, tracks, initiatives, indexOrder)` 순수 — 코드블록 없는 그림 제외 · `deriveTrack(sources→roadmap/<slug>→initiative.track, 없으면 null)` · 그룹(시스템 first→trackOrder→미분류 last)·내부 M-ID asc.
- **🔴 `partition.ts` 무변경** — `buildPlan` 공유(DRY). buildPlan vitest 회귀 green 확인.
- acceptance: spec §Test Strategy core 전부(fixture = jinwooauto 실 `docs/mermaid/` + gootte 자체).

## 의존
- T1·T2 병렬 → T3(T1 타입·T2 RawMermaidDoc 소비). 이 todo 내 순서.
- 다음 = [구조 뷰 surface](2026-07-29-structure-view-surface.md)(T4·T5, 이 spine 의존).

## 관련
- spec = `docs/roadmap/project-manager/web-structure/spec.md` · 그림 = [M-0007](../mermaid/INDEX.md#M-0007) · ADR-0001·0002·0003.
- **Invariant**: INV-2(read-only)·INV-4(순수·결정적) — buildStructure/readMermaidDocs 설계 반영.
