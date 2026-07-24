---
id: M-0003
title: web-viz 2c — CORE projection → viz endpoint → 커스텀 뷰
status: living
supersedes: []
superseded_by: null
sources: [docs/roadmap/project-manager/web-viz/spec.md, docs/mermaid/M-0001-gootte-architecture.md, docs/mermaid/M-0002-web-dashboard-2a.md]
updated: 2026-07-25
---

# M-0003 — web-viz 2c 시각화 데이터흐름

> M-0002(2a) 위 시각화 레이어. projection·kind·기간=CORE 결정적(INV-4), 프론트=커스텀 SVG/CSS 레이아웃.

```mermaid
flowchart LR
  subgraph CORE["web/core · 결정적 projection (INV-4)"]
    PART["partitionInitiatives (buildPlan 공유)"]
    KAN["buildKanban → columns"]
    GAN["buildGantt → rows/bars/markers"]
    LIN["state.lineage (nodes/edges) · 재사용"]
    WT["loadProjectState (worktrees + GitSignal)"]
  end
  subgraph BE["web/backend · Hono (신규 라우트)"]
    R1["GET /api/board/:slug"]
    R2["GET /api/timeline/:slug"]
    R3["GET /api/lineage/:slug (+nodes)"]
    R4["GET /api/worktree/:slug"]
  end
  subgraph FE["web/frontend · 커스텀 SVG/CSS"]
    Q["TanStack Query"]
    V1["보드 (Linear 룩)"]
    V2["타임라인 (CI 워터폴)"]
    V3["그래프 (git-graph DAG)"]
    V4["worktree 패널 (checks 룩)"]
  end

  PART --> KAN --> R1
  GAN --> R2
  LIN --> R3
  WT --> R4
  R1 & R2 & R3 & R4 --> Q
  Q --> V1 & V2 & V3 & V4

  CONTRACT[("CONTRACT — KanbanColumn·GanttRow·WorktreeStatus + envelope")] -.-> R1 & R2 & R3 & R4
  CONTRACT -.-> Q

  classDef p1 fill:#1f6feb,color:#fff
  classDef p2 fill:#2ea043,color:#fff
  classDef con fill:#8957e5,color:#fff
  class PART,KAN,GAN,LIN,WT p1
  class R1,R2,R3,R4,Q,V1,V2,V3,V4 p2
  class CONTRACT con
```

- 🔵 CORE projection(결정적) · 🟢 2c 신규 backend/뷰 · 🟣 CONTRACT 공유 타입.
- 그래프는 신규 projection 없이 `state.lineage` 재사용(LineageResponse에 nodes 추가만).
- 뷰모드 토글(plan→리스트/보드/타임라인, lineage→체인/그래프)은 프론트 UI 상태(URL `?view=`).
