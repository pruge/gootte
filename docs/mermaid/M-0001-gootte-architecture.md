---
id: M-0001
title: project-manager (gootte) 전체 아키텍처 — 재사용 spine (순수 CORE + IO + CONTRACT) + 어댑터
status: living
supersedes: []
superseded_by: null
sources: [docs/roadmap/project-manager/blueprint.md, docs/roadmap/project-manager/lineage-engine/spec.md]
updated: 2026-07-24
---

# M-0001 — gootte 전체 아키텍처

> 재사용 원리: 모든 surface 가 **CORE projections + CONTRACT 타입** 만 소비. parsing·state 재구현 0.
> 실선 = phase 1(이번 spec). 점선 = 후속 phase(어댑터/모듈 추가, CORE 무변경).

```mermaid
flowchart TB
  subgraph SRC[관리대상 cling 프로젝트들]
    D1[jinwooauto docs/*<br/>ledger·ADR·mermaid·INDEX·todo]
    D2[tuya · basket-stacker · …]
  end
  DISC[자동발견<br/>scan .cling/profile.md]:::p1
  SRC --> DISC

  subgraph CORE[순수 CORE · code/web/core · 부수효과 0]
    P[parse content]:::p1 --> ST[state<br/>lineage DAG·상태]:::p1
    ST --> PJ[projections]:::p1
    PJ --> PLAN[plan · rationale]:::p1
    PJ -.-> RENDER[kanban·gantt·graph·worktree·test]:::p2
    PJ -.-> REPORT[report 기간요약]:::p2
  end
  subgraph IO[IO 층 · code/web/core-io]
    RD[fs read]:::p1
    GIT[git · GitSignal]:::p1
    EMIT2[emit]:::p1
  end
  DISC --> RD --> P
  ST -.-> GIT

  CON[(CONTRACT · zod SoT<br/>code/web/contract)]:::p1
  CORE <-->|타입| CON

  subgraph ADP[얇은 어댑터 — surface별]
    CLI[gootte CLI<br/>agent-skill]:::p1
    DIG[digest writer<br/>&lt;repo&gt;/.gootte/PLAN.md]:::p1
    BE[backend WS + .env<br/>+ watcher 즉시]:::p2
    FE[frontend React<br/>Tailwind·Tabler·Pretendard]:::p2
    AND[Android 뷰어<br/>Kotlin codegen]:::p3
    TUN[Cloudflare 터널]:::p3
  end
  PLAN --> CLI
  PLAN --> DIG
  PLAN -.-> BE
  BE -.-> FE
  BE -.-> TUN
  TUN -.-> AND
  CON -.->|codegen| AND

  subgraph RSV[예약 모듈/어댑터 — 구조만 확보]
    CTRL[제어 seam<br/>cling 명령 호출]:::rsv
    LEARN[학습 스토어 P2]:::rsv
    NOTIF[notify ⓓ<br/>slack/push]:::rsv
    EXPORT[report/export ⓑ]:::rsv
    AGG[멀티머신 aggregation ⓐ]:::rsv
    AUTH[multi-user auth ⓒ]:::rsv
  end
  CORE -.-> CTRL
  CORE -.-> LEARN
  PLAN -.-> NOTIF
  REPORT -.-> EXPORT
  BE -.-> AGG
  BE -.-> AUTH

  CLINGW([cling reconcile writer<br/>KickoffEvent 기록]):::ext -.->|ledger ## events| SRC

  AI([AI 세션]):::ext
  HUMAN([사람]):::ext
  CLI --> AI
  DIG --> AI
  FE --> HUMAN
  AND --> HUMAN

  classDef p1 fill:#1f6feb,color:#fff,stroke:#0b3d91;
  classDef p2 fill:#2ea043,color:#fff,stroke:#124d20;
  classDef p3 fill:#8957e5,color:#fff,stroke:#4b2a91;
  classDef rsv fill:#6e7681,color:#fff,stroke:#30363d,stroke-dasharray:4 3;
  classDef ext fill:#d29922,color:#111,stroke:#7d4e00;
```

- 🔵 phase 1 (CORE·CONTRACT·CLI·digest·discovery) · 🟢 2차 웹 · 🟣 3차 터널/Android · ⚪ 예약(제어·학습)
