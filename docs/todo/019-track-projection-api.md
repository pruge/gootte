---
status: pending
priority: normal
initiative: null
area: [web/core, web/core-io, web/backend]
source: spec-decompose
related: [../roadmap/project-manager/track-grouping/spec.md, 018-track-contract-parse]
created: 2026-07-25
---

# track: CORE projection + core-io vocab + backend envelope (T3+T4)

spec T3+T4. [M-0004](../mermaid/INDEX.md#M-0004).

- **T3 CORE**: `ProjectState.tracks: Map<string,string>`(vocab) · 신규 순수 `project/track.ts` `computeTrackOrder(state)`(buildGantt·buildPlan **공유** — 순서 로직 단일소유, DRY) · `buildPlan`/`buildKanban`/`buildGantt` 가 정규화 `Track` 부착 + trackOrder(내부 `GanttResult`·plan 반환에 `trackOrder`). `core-io/load.ts` 가 `<project>/.cling/profile.md` `## Tracks` 읽어 vocab(INV-2 read-only, 없으면 빈 맵→프로즈 fallback).
- **T4 backend**: `TimelineResponse`/`PlanResponse` 에 trackOrder + rows/items track(projection 파생 — 로직 X).

**acceptance**: vitest — build*/projection track+trackOrder(순서 결정적: vocab 순 + vocab밖 indexOrder 순 + 미분류 last) · core-io profile vocab 로드 · app.test /api/timeline·/api/plan 에 track/trackOrder. tsc.
**의존**: 018.
