---
id: M-0007
title: web-structure — 저작 docs/mermaid → core-io read → core buildStructure → 구조 뷰
status: living
supersedes: []
superseded_by: null
sources:
  - docs/roadmap/project-manager/web-structure/spec.md
  - docs/roadmap/project-manager/web-structure/adr/0001-board-renders-authored-mermaid.md
  - docs/roadmap/project-manager/web-structure/adr/0002-track-from-sources-derivation.md
updated: 2026-07-29
---

# M-0007 · web-structure 렌더 데이터흐름

> 🔴 plan "보드" 슬롯을 칸반 → **관리대상 프로젝트 저작 `docs/mermaid/` 렌더**로 교체. 소스=저작(ADR-0001) · track=`sources`→이니셔티브→track 파생(ADR-0002) · 칸반 완전 교체·web-viz 부분 supersede(ADR-0003). M-0002(2a 데이터흐름) 위 surface. **파일 rename 금지.**

## 데이터흐름 (read-only INV-2 · 결정적 INV-4)

```mermaid
flowchart LR
    subgraph proj["관리대상 프로젝트 · read-only (INV-2)"]
        mmd["docs/mermaid/<br/>M-NNNN.md · (INDEX.md 제외)"]
    end
    subgraph io["core-io"]
        read["readMermaidDocs(repoPath)<br/>*.md raw 수집"]
    end
    subgraph core["core · 순수 projection (INV-4)"]
        build["buildStructure(raw, tracks, inits, order)"]
        p1["parseMermaid(fm)<br/>id·title·status·sources"]
        p2["extractMermaidBlock(body)<br/>첫 mermaid 펜스 (없으면 제외)"]
        p3["deriveTrack(sources→initiative→track)<br/>횡단=시스템/공통(null)"]
        p4["group·sort<br/>시스템→trackOrder→미분류 · 내부 M-ID asc"]
        build --- p1 & p2 & p3 & p4
    end
    subgraph ct["contract (seam)"]
        resp["StructureResponse<br/>{ groups:[{track, diagrams[]}] }"]
    end
    subgraph be["backend"]
        ep["GET /api/structure/:slug"]
    end
    subgraph fe["frontend"]
        view["StructureView<br/>track 인덱스 → 클릭 → MermaidBlock 포커스"]
    end

    mmd --> read --> build --> resp --> ep --> view
    inits["p.state.ledgers · profile Tracks<br/>(load.ts 기로드)"] -.->|track 어휘·이니셔티브| build

    dead["buildKanban · BoardView · /api/board · BoardResponse<br/>제거 (web-viz 부분 supersede)"]
    ep -.->|교체| dead

    classDef sot fill:#fde68a,stroke:#b45309,color:#000
    classDef gone fill:#f3d6d6,stroke:#b05050,color:#5a2020,stroke-dasharray:4 3
    class mmd sot
    class dead gone
```

## 재사용 (얇은 구현)
- **렌더** = 기존 `MermaidBlock`(lazy·테마·strict sanitize·실패 fallback) 그대로.
- **파싱** = `parseMermaid`(frontmatter) 에 `sources` + `extractMermaidBlock` 만 추가.
- **그룹핑** = `groupByTrack` + 서버 `trackOrder`(INV-4 verbatim). 리스트·타임라인과 동축.
- **경로·어휘** = core-io `load`(repoPath·profile Tracks·initiatives) 이미 로드.

## 경계
- gootte 는 `docs/mermaid/` **읽기만**(INV-2). 그림 SoT = 프로젝트 소유, `StructureResponse` = 파생(INV-1).
- 자동 import 추출은 **non-goal**(ADR-0001) — 언어별 파서 = gootte 정체성 밖.
