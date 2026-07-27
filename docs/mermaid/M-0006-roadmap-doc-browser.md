---
id: M-0006
title: roadmap-doc-browser 2e — 이니셔티브 폴더 → tree 나열 → cd 브라우저 → DocDrawer
status: living
supersedes: []
superseded_by: []
sources: [M-0001, M-0002]
updated: 2026-07-27
---

# M-0006 — roadmap-doc-browser (2e · W 트랙)

> 이니셔티브 폴더(실제 파일 + `adr/`) + 가상 `todo/`(effInitiative 합성)를 결정적 tree 로 나열 →
> 인라인 cd 브라우저(breadcrumb + 한 레벨 리스트) → 파일 클릭 → 기존 DocDrawer 뷰어. INV-2/4 read-only·결정적.

```mermaid
flowchart TD
  subgraph SoT["관리대상 md SoT (read-only · INV-2)"]
    RF["docs/roadmap/&lt;epic&gt;/&lt;init&gt;/\nbrief·spec·wireframe·ledger·adr/*"]
    TD["docs/todo/*.md\n(initiative back-pointer)"]
  end

  subgraph CORE["@gootte/core (pure · INV-4 결정적)"]
    EI["buildRoadmap → RoadmapItem.done/pending\n소속 todo (archive 포함) 재사용 · effInitiative 재구현 X"]
  end

  subgraph IO["@gootte/core-io (fs read)"]
    RI["resolveInitiativeDir(repo, init)\nroadmap depth≤2 스캔 → 폴더 (결정적)\nepic 은 wire 에 안 실음"]
    LT["listInitiativeTree(repo, init, roadmapItem)\n실제 파일 + adr/ 열거 + 가상 todo/ 병합\n→ TreeNode[] (결정적 정렬)"]
    RD["readDoc(repo, DocRef)\n· roadmap: resolve realpath startsWith(dir) 가드\n· todo/sprint: 기존 basename 가드 (source 분기)"]
  end

  subgraph CONTRACT["@gootte/contract (zod codegen · seam)"]
    TN["TreeNode · DocRef · TreeResponse"]
  end

  subgraph BE["@gootte/backend (Hono)"]
    E1["GET /api/tree/:slug/:initiative"]
    E2["GET /api/roadmap-doc/:slug/:init (별도 경로 · 라우팅 충돌 회피)"]
  end

  subgraph FE["@gootte/frontend (React)"]
    RIR["RoadmapItemRow 펼침 영역\n= FileBrowser (체크리스트 흡수)"]
    FB["FileBrowser\nbreadcrumb + 한 레벨 리스트 (cd)\n기본 path = todo/"]
    DD["DocDrawer + Markdown + MermaidBlock\n(파일 열기 · 재사용)"]
  end

  RF --> RI --> LT
  TD --> EI --> LT
  LT --> TN
  RF --> RD
  TD --> RD
  TN --> E1
  RD --> E2
  E1 -->|TreeResponse| FB
  RIR --> FB
  FB -->|파일 클릭 = DocRef| DD
  DD -->|content 요청| E2
```

## 노드 메모
- **initiative→폴더 해소** — gootte 는 2-level `docs/roadmap/<epic>/<init>/` 이고 state 엔 slug 만 온다. `resolveInitiativeDir` 이 유일 소유자로 폴더를 해소(epic wire 미포함, ADR-0004 §0).
- **가상 `todo/`** — 실제 파일은 `docs/todo/` 에 흩어져 있으나, 이니셔티브 뷰에선 `buildRoadmap` 의 `RoadmapItem.done/pending`(archive 포함) 재사용해 `todo/<slug>.md` 가상 엔트리로 노출(INV-1 파생, `effInitiative` 재구현 X). 열면 기존 `readDoc({source:"todo"})`.
- **경계** — tree 는 이 이니셔티브 폴더 + 가상 todo/ 만. mermaid(`docs/mermaid/`)는 문서 열 때 `MermaidBlock` 인라인 렌더(트리엔 미노출). worktree 라이브 트리 = non-goal(ADR-0003).
- **read-path 결정적(INV-4)** — 열거·정렬 순수, LLM 0. roadmap read 가드 = `resolve(dir,relPath)` realpath 가 폴더로 startsWith(ADR-0004); todo/sprint basename 가드 별도 분기.
