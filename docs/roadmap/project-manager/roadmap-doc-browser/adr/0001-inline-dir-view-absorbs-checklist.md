# ADR-0001: 인라인 펼침 영역을 디렉토리 뷰로 (체크리스트 흡수, 기본 = 가상 todo/)

Status: accepted
Date: 2026-07-27 / 관련: spec.md §Architecture, §UI

## Context
현재 이니셔티브(`RoadmapItemRow`)를 클릭하면 펼쳐지는 인라인 영역에 **한일☑/남은☐ 체크리스트**만
보인다. 그 이니셔티브 폴더의 다른 문서(brief·spec·adr·ledger·wireframe)에 도달할 길이 없다.
사용자 요구 = "roadmap 을 클릭하면 열리는 공간에서 unix 디렉토리 접근하듯이 파일을 찾아 읽고 싶다.
todo 목록은 가상 todo 폴더로. 기본은 todo 폴더."

## Decision
인라인 펼침 영역을 **파일 브라우저(디렉토리 뷰)** 로 바꾼다. 기존 체크리스트는 제거하지 않고
**가상 `todo/` 폴더로 흡수**하며, 브라우저의 **기본 진입 = `todo/` 폴더**(= 현 체크리스트 경험 무손실).
파일 클릭 시 열기는 **기존 우측 `DocDrawer`** 재사용(신규 뷰어 안 만듦).

## Alternatives
- **B) DocDrawer 를 브라우저로 확장(체크리스트 병존)** — 기존 무변경이나 "열리는 공간이 곧 브라우저"
  라는 요구와 한 겹 어긋남. 두 진입점(체크리스트 + 브라우저 버튼)으로 UX 이원화.
- **C) 우측 RoadmapPanel 전체를 파일 트리로** — 진행/완료 탭·리스트와 충돌, 재설계 폭 큼.

## Consequences
- `RoadmapItemRow` 펼침 영역이 `FileBrowser` 로 교체(체크리스트 렌더 로직은 `todo/` 폴더 뷰로 이동).
- DocDrawer 는 뷰어로 유지 — 단 roadmap 폴더 파일도 열 수 있게 read 소스 확장(ADR-0004).
- 기본 path=`todo/` 라 열자마자 할일이 보이는 현 UX 보존, 상위로 올라가면 형제 문서 탐색.

## Invariant impact
- **INV-2**(read-only) — 브라우저는 문서 나열·읽기만. write 없음. 유지.
- 나머지 INV-1/3/4 = ADR-0004 에서 상세.

## Contract impact
없음(이 ADR 은 UI 배치 결정). 공유 타입은 ADR-0004.
