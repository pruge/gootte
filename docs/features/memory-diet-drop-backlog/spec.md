# Specification — 켜둔 앱 메모리 다이어트 + 백로그 기능 제거

## Goal

설치 빌드(`pnpm install:tauri` → preview 모드)로 켜둔 gootte 의 상주 메모리를 낮추고,
이미 죽은 백로그(backlog) 기능을 코드에서 제거한다. 화면이 보여주는 값은 하나도 바뀌지 않는다.

## User stories

1. S1 — 캡틴이 설치 빌드로 앱을 켜두고 몇 시간 두어도 프로세스 상주합(RSS)이 지금보다 분명히 낮다.
2. S2 — 백로그 파일(`<firstmateHome>/data/backlog.md`·`done-archive.md`)이 바뀌어도 전체 캐시 refetch 가 일어나지 않는다(그런 신호 자체가 없다).
3. S3 — 백로그 제거 후에도 features/plan/process 탭이 제거 전과 같은 값을 그린다(백엔드 조인이 이미 빈 목록이라 그려지는 값은 같다).
4. S4 — 설정의 firstmate 홈 지정·프로젝트 발견(discover)·세컨드메이트 명부 동작은 그대로다(제거 범위가 아니다).
5. S5 — 각 변경 뒤 `pnpm verify` 가 green 이다.

## Scope

- 프론트 쿼리 캐시 보관 조건 완화와 영속 저장 범위 축소.
- 광범위 invalidate(전체 무효화)를 키 지정 무효화로 좁히기.
- 백엔드 상주 캐시(`folderCache`) 상한.
- 백로그 신호(`ChangeEvent kind:"backlog"`)·감시·조인 코드 제거.
- 조인 제거 시, 빈 목록 조인이 하던 재계산(대기·착수 가능·머리글 배지·경과 표시)의 동일 결과 보장.

## Out of scope

- DocDrawer 문서 렌더 가상화 — 제보는 유휴(idle) 메모리라서 이번에 안 다룬다.
- `vite preview` → 정적 서빙 구조 변경, `tsx` → 빌드 JS 전환 — 실행 구조 변경이라 별도 계획으로.
- `ticket` kind 신호(git 파생 done) — 백로그와 무관하므로 손대지 않는다.
- firstmateHome 설정 칸·discover·secondmates 명부 — S4, 유지한다.

## Decisions

- D1 — 분류는 Planned. grill 은 캡틴이 면제했다(2026-09-11). 목적지가 분명하고 미해결 선택지가 없어 Wayfinder 는 생략한다.
- D2 — INV-1: 제거 후에도 판·목록·배지는 매 read 파생이다. 캐시를 좁혀도 파생 경로를 새로 만들지 않는다.
- D3 — INV-3: invalidate 를 좁힐 때 WS 신호가 닿는 쿼리는 전부 커버한다. 조용한 stale 을 만들지 않는다.
- D4 — INV-4: 조인 제거 뒤의 상태 판정은 그대로 결정적 계산이다. 빈 목록 조인과 같은 결과를 회귀로 잠근다.
- D5 — firstmateHome·discover·secondmates 는 제거 범위가 아니다(스윕 확인). 백로그 리더·감시·조인·신호만 걷는다.
- D6 — state.json 시간 기록에는 손대지 않는다.

## Existing seams / integration points

- 실시간 무효화 seam: WS `ChangeEvent` → 프론트 `useLiveSync` → TanStack Query invalidate.
- 기능 상태 판정 seam: `applyBacklogStatus`(core) — backend `withBacklogStatus` 와 CLI `withBacklogStatus` 가 공유.
- 감시 seam: `startWatchers`(backend) — 문서·계획·백로그 감시기를 함께 세운다.
- 캐시 seam: `makeQueryClient`(frontend) — gcTime·영속 저장·invalidate 정책 한 곳.

## Data and migration

- 영속 쿼리 캐시(`gootte-query-cache-v1`, localStorage) 키는 유지한다. 저장 범위만 좁히므로 기존 저장본은 다음 fetch 로 자연 교체되고 마이그레이션 불필요.
- `ChangeEvent` 는 런타임 WS 메시지라 영속 형식이 없다. 버전 협상 없이 제거한다.
- 삭제되는 파일의 테스트는 함께 삭제·이관한다.

## Security / authorization

- 해당 없음. 로컬 전용 앱, 새로 열리는 입력·권한 없음.

## Compatibility / rollout

- 한 번에 걷지 않고 신호·감시(T01) → 조인(T02) 순으로 걷는다. 각 단계에서 verify green.
- 도중에 이상이 보이면 해당 티켓까지만 되돌리면 된다(뒤 티켓과 파일 겹침 최소화, 아래 티켓 그래프 참조).

## Acceptance criteria

- A1 — 동일 시나리오(설치 빌드 기동 → 프로젝트 선택 → 30분 방치)에서 변경 전후 프로세스 RSS 합이 감소한다.
- A2 — 백로그 파일 쓰기 후에도 `kind:"backlog"` 방송이 없고, 전체 invalidate 가 일어나지 않는다.
- A3 — 백로그 제거 전후 동일 픽스처에 대한 features/plan 응답이 동일하다(빈 조인 결과와 같음).
- A4 — firstmate 홈 설정·재지정 후 프로젝트 목록이 정상 갱신된다.
- A5 — `pnpm verify` green.

## Verification strategy

- `pnpm verify` 전체 회귀(포트 테스트 + 전 패키지 tsc + vitest).
- 메모리: Activity Monitor 또는 `ps aux -o rss` 로 변경 전후 같은 시나리오 측정. 정밀 비교가 필요하면 웹뷰 DevTools Memory 힙 스냅샷.
- A3: 빈 목록 조인 결과를 고정하는 픽스처 테스트(조인 제거 티켓의 회귀 가드).
