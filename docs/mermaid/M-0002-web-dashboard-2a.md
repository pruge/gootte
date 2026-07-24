---
id: M-0002
title: web-dashboard 2a — CORE → Hono API → React 데이터흐름
status: living
supersedes: []
superseded_by: null
sources: [docs/roadmap/project-manager/web-dashboard/spec.md, docs/mermaid/M-0001-gootte-architecture.md]
updated: 2026-07-25
---

# M-0002 — web-dashboard 2a 데이터흐름

> M-0001(전체)의 phase 2a 상세. backend는 CORE 릴레이(계산·LLM 0), frontend는 렌더. 서버상태=TanStack Query(복제 X, INV-1).

```mermaid
flowchart LR
  subgraph CORE["phase 1 엔진 · 재사용"]
    LOAD["core-io.loadProjectState"]
    PLAN["core.buildPlan"]
    LIN["state.supersessions·drops·edges"]
  end
  subgraph BE["web/backend · Hono"]
    R1["GET /api/projects"]
    R2["GET /api/plan/:slug"]
    R3["GET /api/lineage/:slug"]
    ZOD{{"@hono/zod-validator — CONTRACT 스키마"}}
  end
  subgraph FE["web/frontend · React+Vite"]
    Q["TanStack Query (서버상태 캐시)"]
    URL["URL state (선택·탭)"]
    THEME["theme ctx (system/dark/light)"]
    V1["사이드바"]
    V2["plan 뷰"]
    V3["lineage 뷰"]
  end

  LOAD --> PLAN --> R2
  LOAD --> LIN --> R3
  LOAD --> R1
  R1 & R2 & R3 --> ZOD --> Q
  Q --> V1 & V2 & V3
  URL -.->|선택| Q
  THEME -.-> V1 & V2 & V3

  CONTRACT[("CONTRACT zod — 타입 end-to-end")] -.-> ZOD
  CONTRACT -.-> Q

  classDef p1 fill:#1f6feb,color:#fff
  classDef p2 fill:#2ea043,color:#fff
  classDef con fill:#8957e5,color:#fff
  class LOAD,PLAN,LIN p1
  class R1,R2,R3,ZOD,Q,URL,THEME,V1,V2,V3 p2
  class CONTRACT con
```

- 🔵 phase 1 재사용 · 🟢 2a 신규(backend/frontend) · 🟣 CONTRACT(공유 타입 SoT)
- 2b = WS/watcher가 Q에 invalidate(즉시) · 2c = V2/V3에 칸반/Gantt/그래프.
