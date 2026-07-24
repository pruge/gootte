---
status: done
sprint: lineage-fill
completedAt: 2026-07-24
priority: high
initiative: null
area: [web/core]
source: spec-decompose
related: [../roadmap/project-manager/lineage-supersede/spec.md, 005-contract-parse-adr, 007-cli-lineage]
created: 2026-07-24
---

# state lineage 채움 + render (T3·T5)

spec T3·T5 = lineage 그래프 + 표면화.

- **T3** **신규 `code/web/core/src/state/lineage.ts`**(build.ts 호출 — W3) — `ledger.supersedes`·Supersession·ADR·todo resolvedBy(drop)·source(spawn) → `LineageEdge`(supersede/partial/reference/spawn/dep) 채움 + `drops`. **부분 판정 = 우선순위 키워드**(reference{참조됨·소비·선행의존} > partial{부분·유지·살·생존} > supersede), note verbatim, graceful(W2).
- **T5** `code/web/core/src/project/render.ts` — `renderLineage(state)`(체인·drop verbatim) + `renderPlan` rationale += supersede/drop.

**acceptance**: 부분 판정·"참조됨"구분·drop·graceful vitest green · renderLineage 텍스트 + plan rationale supersede 표면화. (타임라인=phase 2)
**의존**: 005
