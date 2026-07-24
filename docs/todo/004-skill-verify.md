---
status: in_progress
sprint: lineage-cli
priority: normal
initiative: null
area: [web/cli, web/core]
source: spec-decompose
related: [../roadmap/project-manager/lineage-engine/spec.md, 003-cli-digest]
created: 2026-07-24
---

# agent-skill + jinwooauto 검증 (T9·T10)

spec T9+T10 = AI 소비 + 실데이터 닫기.

- **T9** `code/web/cli/skill/SKILL.md` — herdr agent-skill: "관리 컨텍스트면 `<repo>/.gootte/PLAN.md` read 또는 `gootte plan .`" 라우팅.
- **T10** `code/web/core/__fixtures__/jinwooauto/**` + acceptance — 실 docs 복제 fixture 로 `gootte plan jinwooauto` 가 **기대 순서 + 왜 + 방치비용** 과 일치.

**acceptance**: SKILL.md 검증 · jinwooauto plan 정확(순서·근거·방치비용).
**의존**: 003
