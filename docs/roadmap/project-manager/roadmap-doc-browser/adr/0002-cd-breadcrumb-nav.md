# ADR-0002: cd 방식 네비게이션 (breadcrumb + 한 레벨 리스트)

Status: accepted
Date: 2026-07-27 / 관련: spec.md §UI, wireframe.md

## Context
"unix 디렉토리 접근하듯이" 탐색. 이니셔티브 폴더 깊이는 얕다(루트 파일 + `adr/` + 가상 `todo/`,
대개 1~2 뎁스). 인라인 펼침 영역은 세로 공간이 좁다.

## Decision
**breadcrumb + 한 레벨 리스트(cd/ls 방식)** — 한 번에 한 폴더 내용만 리스트로 보여준다.
폴더 클릭 → 진입, 상단 breadcrumb(`init / adr /`)로 상위 이동. 트리 전체를 펼치지 않는다.
트리 데이터는 1회 fetch(ADR-0004) 후 **cd 네비게이션은 프론트가 클라이언트 측**으로 처리.

## Alternatives
- **펼침 트리(파일탐색기 사이드바)** — 전체 계층 조망 좋으나 좁은 인라인 공간엔 부담,
  펼침 상태 관리 복잡. 얕은 폴더엔 이득 작음.
- **둘 다(트리+breadcrumb)** — 유연하나 이 얕은 구조엔 과설계.

## Consequences
- `FileBrowser` = breadcrumb 컴포넌트 + 현재 path 의 자식 노드 리스트. 현재 path 는 로컬 state
  (MVP; URL 영속은 non-goal — §future).
- 백엔드는 전체 tree 를 한 번 주면 되고(레벨별 lazy 불요), 프론트가 path prefix 로 자식 필터.

## Invariant impact
- **INV-4**(결정적 read-path) — cd 는 이미 받은 결정적 tree 안에서의 클라이언트 네비. 서버 재계산 없음. 유지.

## Contract impact
없음(네비 방식). tree 형상은 ADR-0004.
