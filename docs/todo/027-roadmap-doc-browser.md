---
created: 2026-07-27
status: pending           # pending | in_sprint | in_progress | done | dropped
priority: normal          # critical | high | normal | low
sprint: null
initiative: null          # gootte = blueprint 스타일(ledger 미선언) → related 로 연결
area: [web/frontend, web/backend, web/core-io]
tags: [doc-viewer, navigation, plan]
related: [../roadmap/project-manager/web-dashboard/spec.md, ../roadmap/project-manager/web-dashboard/blueprint.md]
source: user-report
---

# roadmap 상세 = Unix 디렉토리형 문서 브라우저 (가상 todo/ 폴더, 기본 = todo)

> 사용자 보고 (2026-07-27) — "roadmap 이름과 할일 목록만 보여주고 있는데. roadmap 관련 문서를 읽고 싶어. roadmap 을 클릭하면 열리는 공간에서 unix 디렉토리 접근하듯이 파일들을 찾아 읽고 싶어. todo 목록은 가상의 todo 폴더를 만들어 위치시켜줘. 기본은 todo 폴더로 하자."

## 의도 (추정)
- 현재: 이니셔티브(roadmap) 클릭 → `RoadmapItemRow` 가 **한일☑/남은☐ 체크리스트**만 인라인 표시, 개별 todo/sprint 문서는 `DocDrawer` 로 단건 열림. 그 이니셔티브 폴더의 **다른 문서(brief·spec·adr·ledger·wireframe·mermaid)에 도달할 길이 없음**.
- 목표: 이니셔티브를 클릭하면 열리는 공간을 **파일 브라우저**로 — 실제 `docs/roadmap/<…>/<initiative>/` 폴더를 **Unix 디렉토리처럼 탐색**(폴더 진입·상위 이동·파일 클릭→읽기). 파일 뷰는 기존 `Markdown`/`MermaidBlock`·raw/보기 토글 재사용.
- **가상 `todo/` 폴더** — 그 이니셔티브에 속한 todo 목록을 실제 파일트리 안에 가상 폴더로 노출(실 파일은 `docs/todo/` 에 흩어져 있지만 이니셔티브 뷰에선 `todo/` 아래 모아 보이게).
- **기본 진입 = `todo/` 폴더 뷰** (현재 체크리스트 경험 보존 — 열면 바로 할일이 보이고, 거기서 상위/형제 문서로 탐색 확장).

## 다음 단계 결정 필요 (→ kickoff 감)
- **기존 체크리스트 대체 vs 병존** — 파일 브라우저가 현 인라인 체크리스트를 대체하나, 아니면 `todo/` 폴더 안에서 체크리스트를 유지하나.
- **네비 형태** — 트리(펼침) vs breadcrumb+리스트(디렉토리 한 레벨씩) vs 둘 다.
- **백엔드 디렉토리 리스팅 엔드포인트** — 이니셔티브 폴더의 파일/서브폴더 트리 반환(`/api/tree/:slug/:initiative` 류). 🔴 **INV-2 read-only**(문서 read 만) · **INV-4 결정적**(fs 나열·정렬 결정적, LLM 0) · **경로 traversal 가드**(이니셔티브 폴더 밖 접근 차단 — 기존 `readDoc` basename 가드 확장).
- **가상 폴더 매핑 규약** — `todo/` 를 어떻게 합성하나(그 이니셔티브 `related`/blueprint phase 로 소속 todo 판정 = 기존 `effInitiative` 재사용). 실제 폴더 + 가상 폴더 병합 트리.
- **파일 종류 범위** — brief/spec/adr/ledger/wireframe 은 실제. `mermaid/M-*.md` 는 참조(다른 폴더)라 링크만 vs 인라인. archive/superseded 표시.
- **worktree 트리** — 활성 worktree 의 라이브 문서도 탐색 대상인가(기존 DocDrawer worktree 파라미터와 정합).

## 관련
- [web-dashboard spec](../roadmap/project-manager/web-dashboard/spec.md) · [blueprint](../roadmap/project-manager/web-dashboard/blueprint.md)
- 재사용: `DocDrawer`·`Markdown`·`MermaidBlock`(뷰어) · `readDoc`(core-io, traversal 가드) · `effInitiative`(소속 todo 판정) · `/api/doc/:slug/:kind/:name`(단건 read — 트리 read 로 확장).
- 016-graph-view(lineage 시각화 — 별개 전선).
