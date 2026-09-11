# Specification — 설정창에 저장소 사용량 + 비우기

## Goal

설정 화면에서 gootte 가 쓰는 저장소(WebKit WebsiteData) 총량을 보여주고,
버튼 하나로 앱 내 캐시를 비운다. 104MB WAL 같은 사태를 캡틴이 직접 보고 치울 수 있게 한다.

## User stories

1. S1 — 캡틴이 설정에서 저장소 사용량을 한 줄로 본다(숫자 + 단위).
2. S2 — "비우기"를 누르면 localStorage·쿼리 캐시·백엔드 파생 캐시가 비워지고 화면이 새로고침된다.
3. S3 — 비운 뒤 수치가 내려가 있음이 보인다(버튼이 동작했다는 증거).

## Scope

- 백엔드 측정·비우기 엔드포인트 2개 + contract 스키마.
- 설정 화면에 사용량 한 줄 + 비우기 버튼 1개.
- 측정 대상: WebKit WebsiteData 전체 합산 한 줄(캡틴 결정).

## Out of scope

- 항목별 내역(LocalStorage/NetworkCache 분리) — 결정에서 제외.
- WAL 즉시 삭제·앱 재시작 — 결정에서 제외. WAL 잔량은 다음 정상 종료 때 SQLite 가 정리한다.
- Linux/Windows 경로 — macOS 전용, 다른 플랫폼은 "확인 불가" 표시.

## Decisions

- D1 — 분류는 Planned(백엔드 1 + 프론트 1 + 검수). grill 면제 — 캡틴 질문 2개로 범위 확정됨(2026-09-11).
- D2 — INV-1: 비우는 것은 전부 파생물(쿼리 캐시·folderCache·스냅샷 적재·localStorage 영속본)이라 안전하다. 다음 read 가 다시 계산한다.
- D3 — INV-3: 비운 뒤에는 새로고침으로 신선한 값을 다시 읽는다. 낡은 화면을 남기지 않는다.
- D4 — INV-5: 용량은 그때 계산하는 사실이라 저장하지 않는다. 읽을 때마다 잰다.
- D5 — 측정 경로는 env(`GOOTTE_WEBKIT_DATA_DIR`) 오버라이드 + macOS 기본값. tauri.conf 의 identifier 가 번들 ID 의 SoT 다.
- D6 — 버튼 동작 범위: 앱 내 비우기까지. WAL 파일 자체는 다음 종료 때 정리됨을 UI 문구로 밝힌다.

## Existing seams / integration points

- 설정 seam: `GET/PUT /api/settings` 옆에 `GET /api/storage`·`POST /api/storage/clear` 를 둔다.
- contract: `StorageResponse` zod 한 곳 정의, 양쪽이 파생한다.
- 프론트 설정 화면: `SettingsView` 에 한 행 추가.

## Data and migration

- 저장하는 값 없음(D4). 마이그레이션 없음.

## Security / authorization

- 로컬 전용. 측정·삭제 모두 앱 자기 데이터 디렉토리 안으로 한정한다. 경로 탈출(상위 삭제) 금지 — 삭제는 파일 단위가 아니라 캐시 API + 화이트리스트 디렉토리로만.

## Compatibility / rollout

- T01(백엔드) → T02(프론트) 순. 각 단계 verify green.

## Acceptance criteria

- A1 — 설정에 총량이 보인다(실측 디렉토리와 대략 일치).
- A2 — 비우기 후 수치가 내려가고 화면이 정상 동작한다.
- A3 — 지원 불가 플랫폼에서는 "확인 불가"로 죽지 않는다.
- A4 — `pnpm verify` green.

## Verification strategy

- 백엔드 계약 테스트(픽스처 디렉토리 + env 오버라이드).
- 프론트 단위 테스트(바이트 표기·버튼 배선).
- `pnpm verify` 전체.
