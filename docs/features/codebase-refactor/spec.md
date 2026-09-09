# Specification

## Goal

gootte 코드베이스에서 죽은 코드, 불필요한 의존성, 과도한 export, 중복 로직, 큰 파일, stale 주석을 체계적으로 정리한다. 각 단계는 검증 가능한 독립 슬라이스로, 기존 테스트가 계속 통과함을 보장한다.

## User stories

1. 죽은 코드(호출자 없는 함수/컴포넌트/파일)를 삭제해도 동작이 바뀌지 않는다
2. import 되지 않는 npm 의존성을 제거해도 빌드가 깨지지 않는다
3. 내부 전용 export에 `export` 키워드를 제거해도 클라이언트 동작이 바뀌지 않는다
4. 중복 유틸리티를 공유 모듈로 추출해도 기존 기능이 유지된다
5. 큰 파일을 분리해도 동일한 테스트가 통과한다
6. stale 주석을 정리해도 코드 동작이 바뀌지 않는다

## Scope

- 죽은 코드 7개 삭제 (파일 1개, 함수 5개, 컴포넌트 1개, 훅 1개)
- 불필요한 npm 의존성 3개 제거 (gray-matter, js-yaml, @dnd-kit/modifiers)
- 내부 전용 export 38개의 `export` 키워드 제거
- 중복 유틸리티 3건 통합 (AREA_LABEL, isTicketDoc 패턴, clearDiscoverCache)
- 큰 파일 4개 분리 (app.ts, ProcessView.tsx, PlanView.tsx, SettingsView.tsx)
- stale 주석 3곳 정리 + dead import 1건 제거
- 불필요한 캐시 함수 1개 제거 (clearDiscoverCacheMemory)

## Out of scope

- features-worker.ts Worker 스레드 아키텍처 재설계 (성능 개선 시 재고)
- git 모듈 자체의 기능 축소 (격리 사본 관측은 현 유지)
- 테스트 프레임워크 변경
- CI/CD 파이프라인 변경

## Decisions

- **expand/migrate/contract 없음**: 각 티켓은 독립적으로 안전한 변경. 기존 코드와 새 코드를 병행할 필요 없이 즉시 교체
- ** AREA_LABEL 공유 위치 = `@gootte/contract`**: CLI와 frontend가 모두 소비하므로 contract에 둔다
- **isTicketDoc 공유 위치 = `@gootte/core`**: 파싱 로직은 전부 core에 있으므로 ticket-path.ts에 통합
- **파일 분리 전략**: 라우트 도메인별로 분리 (memo/time/settings), 컴포넌트는 하위 컴포넌트 추출

## Existing seams / integration points

- `@gootte/contract`: 공유 타입/상수. AREA_LABEL 추가 적합
- `@gootte/core/src/parse/ticket-path.ts`: 티켓 경로 파싱. isTicketDoc 통합 적합
- `code/web/backend/src/app.ts`: Hono 라우트. 도메인별 분리 가능
- `code/web/frontend/src/components/`: 컴포넌트 디렉토리 구조. 하위 컴포넌트 추출 자연스러움

## Acceptance criteria

- `pnpm verify` 전체 회귀 통과
- 기존 vitest 테스트 전부 통과
- TypeScript 컴파일 에러 없음
- 삭제한 코드/의존성을 사용하는 새 코드 없음

## Verification strategy

각 티켓 완료 시 `pnpm verify` 실행. 최종 티켓에서 전체 회귀 확인.
