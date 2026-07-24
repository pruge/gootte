---
status: pending
priority: high
initiative: null
area: [web/contract, web/core, web/core-io]
source: spec-decompose
related: [../roadmap/project-manager/lineage-engine/spec.md, 002-state-projections, 003-cli-digest, 004-skill-verify]
created: 2026-07-24
---

# contract + parsers + worktree/git primitive (T1·T2·T4)

spec [Task Breakdown](../roadmap/project-manager/lineage-engine/spec.md#task-breakdown) T1·T2·T4 = 토대 (T1 후 T2·T4 병렬).

- **T1** `code/web/contract/**` — blueprint seam zod 스캐폴드(+`Sprint`·`Worktree`). TS 직접 import(JSON schema=3차).
- **T2** `code/web/core/parse/**` — (순수) ledger/ADR/mermaid/INDEX/todo **+ sprint** frontmatter → 타입.
- **T4** `code/web/core-io/git/**` — worktree 스캔(`.claude/worktrees/`) + **B1 git primitive** `conflictRisk(base,mainTip,wtTip)`(merge-tree)·`merge-base`.

**acceptance**: 타입 export + `tsc` green · jinwooauto fixture 파싱 vitest · merge-tree fixture → high/med/low vitest.
**의존**: — (실행 준비 완료, spec 이 닫음)
