# roadmap-doc-browser — brief (2e · W 트랙)

> 이니셔티브(roadmap)를 클릭하면 열리는 인라인 공간을 **Unix 디렉토리형 문서 브라우저**로.
> 그 이니셔티브 폴더의 문서(brief·spec·adr·ledger·wireframe)를 cd/ls 감각으로 탐색·열람하고,
> 할일 목록은 **가상 `todo/` 폴더**로 노출하되 **기본 진입 = todo/**(현 체크리스트 경험 무손실).

## 문제 / 동기
- 현재 이니셔티브 펼침 영역 = 한일/남은 **체크리스트만**. 그 이니셔티브의 **설계 문서에 도달할 길이 없다** —
  brief/spec/adr/ledger 를 보려면 리포지토리를 직접 열어야 함. gootte 는 "관리 현황 한눈"이 목적인데
  정작 *왜/무엇을* 담은 문서가 대시보드에서 안 보인다.
- 사용자 요구(원문): "roadmap 이름과 할일 목록만 보여주고 있는데. roadmap 관련 문서를 읽고 싶어.
  roadmap 을 클릭하면 열리는 공간에서 unix 디렉토리 접근하듯이 파일을 찾아 읽고 싶어. todo 목록은
  가상의 todo 폴더를 만들어 위치시켜줘. 기본은 todo 폴더로 하자."

## 라이프사이클
- read-only 조회 기능(INV-2). 이니셔티브 선택 → 인라인 브라우저 열림 → cd 로 폴더 탐색 → 파일 클릭 →
  DocDrawer 로 열람(raw/보기 토글·mermaid 인라인). 파일 변경 시 기존 live(WS) invalidation 으로 최신 반영.

## scope / phase 경계
- **이번 phase(2e)**: 인라인 cd 파일 브라우저 + 이니셔티브 폴더 실제 파일 + 가상 `todo/` + 기존 DocDrawer 연결.
- **블루프린트 위치**: W(웹 대시보드) 트랙, dep 2a(web-dashboard). web-viz(2c)와 병렬 인접 역량.
- **non-goal**(§future): 참조 mermaid 를 가상 폴더로 탐색 · 활성 worktree 라이브 트리 · 브라우저 path 의 URL 영속 ·
  파일 편집(INV-2 위반) · 검색/grep.

## 재사용 map (재발명 금지)
| 자산 | 재사용 |
|---|---|
| `DocDrawer` + `Markdown` + `MermaidBlock` + `ViewMode`(raw/보기) | 파일 **열기** 뷰어 — 그대로 |
| `readDoc`(core-io) | roadmap 소스로 **확장**(폴더=resolveInitiativeDir·realpath 가드), todo/sprint basename read 는 가상 todo/ 열기에 재사용 |
| `/api/doc` | roadmap 소스 추가, todo/sprint 는 유지 |
| `buildRoadmap`/`RoadmapItem.done·pending`(core) | 가상 `todo/` 소속·status 재사용 (**effInitiative 는 private closure·미export → 재구현 금지**) |
| `RoadmapItemRow` 체크리스트 | 가상 `todo/` 폴더 뷰로 **이동/흡수** |
| *신규* `resolveInitiativeDir`(core-io) | 2-level `docs/roadmap/<epic>/<init>/` 폴더 해소(state 엔 slug 만) — 단일 소유자 |
| TanStack Query · useLiveSync | tree/content 조회 + 최신화(INV-3) |

## non-goal
- 문서 편집·생성(gootte read-only, INV-2) · 검색 · mermaid 폴더/worktree 트리 탐색 · URL deep-link(→future).

## future
- 참조 mermaid 가상 폴더(ADR-0003 대안 B) · worktree 라이브 트리(ADR-0003 대안 C) · 브라우저 path URL 영속(공유 링크) · 파일 내 검색.

## 구조 그림
- [그림 M-0006](../../mermaid/INDEX.md#M-0006) — 이니셔티브 폴더 → tree 나열 → cd 브라우저 → DocDrawer.

## ADR 색인
- [ADR-0001](adr/0001-inline-dir-view-absorbs-checklist.md) — 인라인 펼침 영역 = 디렉토리 뷰(체크리스트 흡수, 기본 todo/).
- [ADR-0002](adr/0002-cd-breadcrumb-nav.md) — cd 방식 네비(breadcrumb + 한 레벨 리스트).
- [ADR-0003](adr/0003-strict-content-boundary.md) — 엄격 콘텐츠 경계(폴더 + 가상 todo/; mermaid 인라인; worktree non-goal).
- [ADR-0004](adr/0004-single-tree-endpoint-path-read.md) — 단일 tree 엔드포인트 + 경로기반 read 일반화 + 가상 todo/ 합성.
