# ADR-0004: 기록계약 하이브리드 — blueprint external-writer seam 소비

Status: accepted
Date: 2026-07-24 / 관련: spec.md §Data Model, ../blueprint.md §③ 기록계약, ADR-0002

## Context
re-kickoff 인과("왜")를 가장 잘 아는 건 그 순간 re-kickoff 한 프로젝트 세션 AI. gootte 가 나중에 산문 역추적 = lossy. blueprint 이 이를 **external-writer seam**(gootte reader + cling writer 공동소유)으로 정의: 스키마 `KickoffEvent`, 저장 `ledger.md ## events` 정형 md.

## Decision
phase 1 = **하이브리드 읽기**:
- 관리대상 `ledger.md ## events` **정형 있으면 파싱**(권위 있는 trigger).
- **없으면 산문 fallback**(ledger `## supersede`·INDEX Now/Next 에서 best-effort, `trigger` nullable).
- cling 무변경으로 시작 — writer 규약(reconcile 이 정형 emit)은 **paired 외부 cling 작업**(gootte phase 안 막음). 레거시(jinwooauto 99) = 산문 fallback + 후속 backfill.

## Alternatives
- 순수 산문 파싱만(원안 ADR-0004) → 권위 없음·취약. blueprint 가 구조화 계약으로 승격.
- cling writer 규약 선행 → jinwooauto 99 백필 선행. 하이브리드가 phase 1 을 안 막음.

## Consequences
- (+) 신규 데이터 = 권위 있는 구조화 읽기. 레거시 = fallback 으로 무중단.
- (+) 파싱 취약점이 jinwooauto 검증(T10)에서 실증 → cling writer 규약 우선순위 판단 근거.
- (−) 두 경로(구조화/산문) 유지.

## Invariant impact
없음(읽기 전용 유지, INV-2).

## Contract impact
`KickoffEvent` = blueprint external-writer seam(cross-repo, 버전). phase 1 은 reader 측 구현.
