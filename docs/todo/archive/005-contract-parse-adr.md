---
status: in_progress
sprint: lineage-fill
priority: high
initiative: null
area: [web/contract, web/core, web/core-io]
source: spec-decompose
related: [../roadmap/project-manager/lineage-supersede/spec.md, 006-state-render, 007-cli-lineage]
created: 2026-07-24
---

# contract 확장 + parsers + load ADR 배선 (T1·T2·T4)

spec [Task Breakdown](../roadmap/project-manager/lineage-supersede/spec.md#task-breakdown) T1·T2·T4 = 데이터/파싱 층.

- **T1** `code/web/contract/src/index.ts` — `LineageEdge`(kind: +supersede-partial/reference · note? · adr?) · `TodoItem`(+resolvedBy/source) · 신규 `Supersession`·`DropRecord`·`TimelineEvent`.
- **T2** `code/web/core/src/parse/{index-doc,todo}.ts` — parseIndex += Supersession 섹션 파싱 · parseTodo += resolvedBy/source.
- **T4** `code/web/core-io/src/load.ts` — `adr/*.md`+`adr/_superseded/` 읽어 parseAdr → state 입력.

**acceptance**: 타입 export + tsc · jinwooauto fixture INDEX Supersession·todo resolvedBy/source 파싱 vitest green.
**의존**: — (spec 이 닫음)
