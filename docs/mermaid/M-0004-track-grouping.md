---
id: M-0004
title: track-grouping 2d — ledger/profile track → 정규화 → 그룹 projection → 그룹 렌더
status: living
supersedes: []
superseded_by: null
sources: [M-0003]
updated: 2026-07-25
---

# M-0004 — track-grouping (2d)

> 소유 prose = `docs/roadmap/project-manager/track-grouping/spec.md`. M-0003(web-viz) 위 대분류 축.
> external-writer seam(cling writer + gootte reader) = KickoffEvent 동형.

```mermaid
flowchart LR
  subgraph writer["cling writer (별 repo — paired)"]
    PROF["profile.md<br/>## Tracks (어휘 key→label)"]
    LED["ledger.md<br/>frontmatter track: C<br/>또는 프로즈 - 트랙:"]
  end

  subgraph core["web/core (순수 · INV-4 결정적)"]
    PPT["parseProfileTracks<br/>→ vocab Map"]
    PL["parseLedger<br/>frontmatter 우선 + 프로즈 fallback<br/>→ track 원문"]
    NT["normalizeTrack(raw, vocab)<br/>클린·key추출·label해소<br/>→ Track{key,label} | null"]
    BLD["buildPlan / buildKanban / buildGantt<br/>+ track 부착 + trackOrder"]
  end

  subgraph io["web/core-io (INV-2 read-only)"]
    LOAD["load.ts<br/>profile ## Tracks 읽기"]
  end

  subgraph contract["web/contract (zod SoT)"]
    T["Track{key,label}<br/>PlanItem.track · GanttRow.track<br/>TimelineResponse/PlanResponse.trackOrder"]
  end

  subgraph view["web/frontend (렌더 전용)"]
    TL["TimelineChart<br/>좌측 대분류 세로 span + │ + hover co-highlight"]
    LI["PlanView<br/>track 섹션 헤더"]
    BD["BoardCard<br/>정규화 track 칩"]
  end

  PROF --> LOAD --> PPT --> NT
  LED --> PL --> NT
  NT --> BLD
  BLD --> T
  T --> TL
  T --> LI
  T --> BD

  classDef ext fill:#f5f0e8,stroke:#b8a888,color:#3a3a3a
  classDef pure fill:#e8f0f5,stroke:#88a8b8,color:#1a2a3a
  class writer ext
  class core,io pure
```

- **하이브리드**(ADR-0001): frontmatter `track:` 있으면 읽고 없으면 프로즈 `트랙:` fallback.
- **label 해소**(ADR-0002): 카노니컬 key → profile `## Tracks` 어휘 · 레거시 프로즈 → 인라인 파생(verbatim).
- **그룹 렌더**(ADR-0003): 타임라인 = 좌측 세로 span + hover co-highlight · 리스트 = 섹션 헤더 · 보드 = 칩.
