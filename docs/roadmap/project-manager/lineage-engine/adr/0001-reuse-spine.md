# ADR-0001: 재사용 spine 채택 — 순수 CORE + IO 분리 + 단일 CONTRACT

Status: accepted
Date: 2026-07-24 / 관련: spec.md §Architecture, ../blueprint.md, M-0001

## Context
epic blueprint 이 재사용 spine(순수 CORE + IO + CONTRACT)을 심었다. phase 1 은 그걸 **구현**한다. kickoff-review B3 = "순수 CORE 주장 ↔ CORE 에 IO(git/discover/emit) 배치 모순" → 순수성·테스트성·spine 무결이 깨짐.

## Decision
blueprint spine 채택 + **CORE/IO 물리 분리**:
- **`web/core` = 순수** — `parse(content)` · state · projections. 부수효과 0 → vitest 완전.
- **`web/core-io` = IO** — fs read · discover · git(GitSignal) · emit. CORE 를 호출하되 CORE 는 IO 를 모름.
- **`web/contract` = zod SoT** — 모든 surface 가 소비/파생.
- 모든 어댑터(CLI·digest·후속 웹/Android)는 CORE projections + CONTRACT 만 소비.

## Alternatives
- CORE 에 IO 혼재(원안) → 순수성·vitest 완전성·이식성 상실(B3). 기각.
- surface별 독립 구현 → parsing N벌·drift·덕지덕지. 기각.

## Consequences
- (+) CORE 순수 = fixtures(jinwooauto) vitest 완전. IO 는 임시 git repo fixture 로 격리 테스트.
- (+) 1차 spine 이 2~7차를 받침. render/기능 추가 = 어댑터/모듈.
- (−) CORE↔IO 경계 설계 선지불.

## Invariant impact
INV-1(projection 재생성) 구조 보장 — projections = CORE 순수함수, 저장 SoT 없음.

## Contract impact
`web/contract` 최초 스캐폴드(T1) = blueprint seam 구현. 재정의 아님.
