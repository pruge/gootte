---
status: in_progress
sprint: lineage-plan
priority: high
initiative: null
area: [web/core]
source: spec-decompose
related: [../roadmap/project-manager/lineage-engine/spec.md, 001-contract-parsers, 003-cli-digest]
created: 2026-07-24
---

# state(worktree 매핑) + projections plan/rationale(B2) (T3·T5)

spec T3+T5 = lineage 심장. 둘 다 **순수**.

- **T3** `code/web/core/state/**` — lineage DAG + **worktree↔initiative 매핑**(T4 가 준 worktree 목록 + `sprint → todos → initiative:` 체인).
- **T5** `code/web/core/project/**` — **B2** 3-분할(active/ready/blocked) 랭킹 → `PlanItem[]` + **GitSignal 조립**(state 매핑 + T4 primitive) + `PlanRationale`(방치비용〔B1〕·독립·정지점). **설계완결 proxy**(spec 존재+분해+worktree 없음).

**acceptance**: DAG·worktree 매핑 · 3-분할 랭킹·NOW·근거·GitSignal vitest green.
**의존**: 001
