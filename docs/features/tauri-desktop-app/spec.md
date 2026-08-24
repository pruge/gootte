# Specification — tauri-desktop-app

## Goal
gootte를 macOS 데스크톱 앱(Tauri)으로 제공하고, 사용자가 감시 대상 프로젝트 루트와 firstmate 홈 경로를 설정 메뉴에서 지정하게 하며, 신관례(features/tickets) 문서와 그 실시간 갱신을 지원한다.

## User-visible behavior
1. 데스크톱 아이콘/명령으로 gootte 창이 열리고 기존 UI가 그대로 동작한다.
2. 새 "설정" 진입점에서 (a) 감시 루트 폴더를 네이티브 폴더 선택기로 지정, (b) firstmate 홈 경로를 입력할 수 있다. 저장 시 즉시 적용되고 재시작 후에도 유지된다.
3. 지정 루트 아래 프로젝트의 docs/features 변화(새 feature·ticket 파일 추가/변경)가 이벤트 발생 후 수 초 내 화면에 반영된다. 이벤트 감시 실패 시 주기 풀스캔으로라도 반영된다.
4. 기능 카드 트리에 tickets/TNN.md, grill.md, design/, wayfinder.md 가 실재하는 만큼 표시되고, 클릭하면 원문이 드로어에 열린다.
5. 티켓 상태는 firstmate 홈 백로그(tasks-axi)와 `<parent>-t<NN>` id로 조인되어 표시된다. 백로그 상태 변화도 실시간 반영된다.

## Scope
- `src-tauri/`: Tauri 셸(창, 네이티브 폴더 다이얼로그, FS 이벤트 감시 명령), macOS 타깃
- 프론트엔드: 설정 UI(탭 또는 모달), 트리 확장(tickets/grill/design/wayfinder 노드), 백로그 조인 표시
- core-io/core: 경로 설정 저장소(INV-5 계약 준수), 신관례 리더 확장, 백로그 리더(결정적)
- scripts: tauri dev/build 연동

## Out of scope
Windows/Linux 타깃, 코드 서명·공증, 문서 편집(INV-2), mermaid 렌더 복원, 관리대상 문서 쓰기.

## Decisions
grill.md D1~D5 참조(단일 출처). 요약: Tauri=셸 계층(D1) · 설정은 gootte 자체 저장소(D2) · FS 이벤트+폴백 폴링(D3) · tickets+grill/design/wayfinder 표시 및 백로그 조인(D4) · macOS 우선(D5).

## Existing seams / integration points
- 기존 discover/read 경로(core-io) 재사용 - 새 파서는 신관례 파일만 추가.
- INV-1~5 전부 유효: 파생물만, 읽기전용, stale 금지, 결정적 read-path, 사람만 아는 것만 저장.
- 백로그 조인: firstmate 홈의 tasks-axi 백로그 데이터를 읽어 `<parent>-t<NN>` ↔ tickets/T<NN> 매핑. 상태의 단일 출처는 백로그(사관장 확정 b안).

## Data and migration
설정 파일은 신규 생성(lazy). 기존 사용자 데이터 없음 - 마이그레이션 없음.

## Security / authorization
FS 감시·읽기는 지정 루트와 firstmate 홈으로 한정(기능 폴더 밖 탈출 차단 계승). 네이티브 다이얼로그 외 임의 경로 접근 금지.

## Compatibility / rollout
웹 실행 경로(scripts/dev)는 유지 - Tauri는 추가 실행 수단. 기존 테스트 전부 유지·통과.

## Acceptance criteria
1. `tauri dev`로 창이 열리고 현재 UI 전 기능 동작.
2. 설정에서 루트 지정 → 해당 루트 프로젝트들이 목록에 뜬다; 재시작 후 유지.
3. tickets/grill/design/wayfinder 파일이 트리에 실재하는 만큼 뜨고 드로어로 원문 열람.
4. 티켓 줄에 백로그 상태가 조인 표시된다; 상태 변경이 이벤트 후 수 초 내 반영.
5. FS 감시 불가 환경에서 폴링으로 폴백해도 갱신된다.
6. 기존 vitest/e2e 전부 green + 새 컴포넌트 테스트.

## Verification strategy
위험도 elevated(새 셸 계층). cargo check/clippy + vitest(신관례 리더·조인·설정 저장소) + 수동 시나리오(루트 지정→변경→실시간 반영) + 기존 e2e 회귀.

## T-review
말단 검수 티켓 필수 - 사관장이 앱을 직접 띄워 수용기준 대로 확인.
