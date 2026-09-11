# Specification — 쿼리 영속 저장을 닫을 때 한 번으로

## Goal

localStorage 쓰기 폭증(500ms마다 전량 직렬화 → SQLite WAL 104MB 실측)을 없앤다.
화면이 보여주는 값과 새로고침 즉시 그리기(T07)는 그대로 유지한다.

## User stories

1. S1 — 앱을 켜두고 써도 `localstorage.sqlite3-wal` 이 메가바이트 단위로 자라지 않는다.
2. S2 — 새로고침 직후에도 읽었던 내용이 바로 그려진다(빈 화면 없음, T07 유지).
3. S3 — 앱을 닫았다 열어도 마지막 상태가 복원된다(기존 영속 계약 유지).

## Scope

- `attachSaver` 를 dirty-flag + flush(숨김·닫힘·60초 안전망) 구조로 교체.
- 저장 범위·형식·키는 그대로(신선도 필터·featureDoc 제외 유지).

## Out of scope

- 저장 범위 축소(projects+settings만 등) — T07 즉시 그리기를 건드리므로 별도 판단으로 남긴다.
- 키 이름 변경·마이그레이션.

## Decisions

- D1 — 분류는 Planned(단일 슬라이스 + 종착 검수). grill 면제 — 목적지가 분명하다.
- D2 — INV-1: 영속본은 파생물 캐시라 안 써져도 된다. 못 쓰면 다음 fetch 가 메운다.
- D3 — INV-3: 닫힘 신호가 안 와도 60초 안전망이 stale 폭을 묶는다.
- D4 — 저장 실패는 지금처럼 조용히 무시한다(치명하지 않다).

## Existing seams / integration points

- `makeQueryClient` — 영속 저장 배선의 한 자리(`lib/query.ts`).

## Data and migration

- 키·형식 그대로라 기존 저장본과 호환된다. 마이그레이션 불필요.

## Security / authorization

- 해당 없음.

## Compatibility / rollout

- 한 티켓으로 교체한다. 이상 시 이전 디바운스 구조로 되돌리면 된다.

## Acceptance criteria

- A1 — 10분 사용 뒤 WAL 증가가 킬로바이트 단위다(메가바이트 금지).
- A2 — 새로고침 후 이전 내용이 바로 그려진다.
- A3 — `pnpm verify` green.

## Verification strategy

- 신규 단위 테스트(숨김·인터벌·제외 조건) + `pnpm verify`.
- A1 은 실운행 후 `ls -la LocalStorage` 로 캡틴 확인.
