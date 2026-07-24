# ADR-0002: gootte read-path 결정적·LLM-free (지능은 write-time)

Status: accepted
Date: 2026-07-24 / 관련: spec.md §Invariants (INV-4)

## Context
"왜"를 richer 하게 만들려고 `gootte plan/lineage` 가 LLM 을 부를 수 있나? gootte 의 목적 = **AI 가 매 세션 재추론하는 비용을 없애기.** read-path 에 LLM 을 넣으면 그 비용을 gootte 안으로 옮길 뿐(비결정·매번 호출).

## Decision
**gootte read-path(plan/lineage/digest 생성)는 결정적·LLM-free.**
- 순서·부분판정·drop·타임라인 = **계산/키워드**(vitest 검증).
- 산문 "왜"(ledger supersede·resolvedBy·trigger)는 **verbatim 릴레이** — 요약·재생성 X.
- 지능(왜 판단)은 **write-time**: cling 세션 AI 가 re-kickoff/reconcile 때 문서에 씀. gootte 는 read-time 에 릴레이만.
- (선택 예외) 사람용 내러티브 = 별도 `gootte explain` 류가 *plan 을 읽어* AI 서술 — plan 생성기가 아님(소비자).

## Alternatives
- read-path LLM 합성 → 비결정·비용·검증불가 + 목적(재추론 제거) 자기모순. 기각.

## Consequences
- (+) 결정적·재현·싸다(파일 read = 인프라 0, AI floor 유효). vitest 로 전체 검증.
- (+) capture-at-write-time 원칙 완성 — AI 는 저자(write)·독자(read), gootte 엔진 아님.
- (−) "왜" 품질 = write-time 문서 품질에 의존(개선은 external-writer seam=별 후속, LLM 아님).

## Invariant impact
**신규 INV-4** 도입 → `.cling/profile.md` Invariants 에 추가 제안. 전 read-path 명령이 준수.

## Contract impact
없음(원칙 — 코드 구조엔 "LLM 호출 0" 로 반영).
