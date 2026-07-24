---
status: in_progress
sprint: lineage-command
priority: normal
initiative: null
area: [web/cli]
source: spec-decompose
related: [../roadmap/project-manager/lineage-supersede/spec.md, 006-state-render]
created: 2026-07-24
---

# cli lineage + jinwooauto 검증 (T6·T7)

spec T6·T7 = CLI 명령 + 실데이터 acceptance.

- **T6** `code/web/cli/src/{commands,main}.ts` — `gootte lineage <proj>` 명령(supersede 체인·drop 텍스트) + 루트 `pnpm lineage` 스크립트.
- **T7** `__fixtures__` + acceptance — `gootte lineage jinwooauto` 가 실 supersede 체인·drop(resolvedBy 43)을 **verbatim·결정적**으로 표면화. plan rationale에도 supersede 뜨는지.

**acceptance**: `gootte lineage jinwooauto` 텍스트 정확(체인·drop·부분여부) · INV-4(LLM 0) 준수 · 루트 `pnpm lineage` 동작.
**의존**: 006
