---
status: done
sprint: lineage-cli
completedAt: 2026-07-24
priority: high
initiative: null
area: [web/core-io, web/cli]
source: spec-decompose
related: [../roadmap/project-manager/lineage-engine/spec.md, 002-state-projections, 004-skill-verify]
created: 2026-07-24
---

# discover + emit + CLI (T6·T7·T8)

spec T6+T7+T8 = IO 어댑터 + CLI.

- **T6** `code/web/core-io/discover/**` — 머신 scan → `.cling/profile.md` 프로젝트 목록. (001 후 병렬)
- **T7** `code/web/core-io/emit/**` — projection → `<repo>/.gootte/PLAN.md`(AUTO-GENERATED 헤더 · `.gootte/` gitignore). INV-2 carve-out.
- **T8** `code/web/cli/**` — `gootte` CLI: `plan`·`digest`·`discover`. core 호출.

**acceptance**: `gootte plan jinwooauto` = 순서(full)+왜 텍스트 · `gootte digest jinwooauto` = `.gootte/PLAN.md` 생성.
**의존**: 002
