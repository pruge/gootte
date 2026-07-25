---
status: in_progress
sprint: track-seam
priority: normal
initiative: null
area: [web/contract, web/core]
source: spec-decompose
related: [../roadmap/project-manager/track-grouping/spec.md, 019-track-projection-api]
created: 2026-07-25
---

# track: CONTRACT seam + CORE 정규화 (T1+T2)

spec T1+T2. [ADR-0001](../roadmap/project-manager/track-grouping/adr/0001-track-external-writer-seam.md)·[ADR-0002](../roadmap/project-manager/track-grouping/adr/0002-profile-tracks-label-resolution.md).

- **T1 CONTRACT**: 신규 `Track{key,label}` · `PlanItem.track`(string→`Track.nullable`) · `GanttRow.track` 추가 · `TimelineResponse`/`PlanResponse` 에 `trackOrder: string[]`. codegen.
- **T2 CORE parse**: 신규 순수 `parse/track.ts` — `normalizeTrack(raw, vocab)`(클린·key추출·label해소, 18변형→7축) · `parseProfileTracks(content)`(profile `## Tracks` 표 → key↔label). `parse/ledger.ts` track = **frontmatter `track:` 우선 + 프로즈 `트랙:` fallback**(하이브리드, 레거시 무회귀).
- 복수 track 표기(`A … / E …`) = 선두 1개 채택.

**acceptance**: `contract:check`(codegen diff 0) · vitest — normalizeTrack 18변형 수렴·label 해소(vocab/프로즈)·미분류(null/공백)·frontmatter 우선·parseProfileTracks 표 파싱. tsc.
**의존**: 없음(seam 선행). **실행 준비 완료**(spec 이 닫음).
