# ADR-0005: 관찰 전용 + 제어 seam 예약 (D1-다)

Status: accepted
Date: 2026-07-24 / 관련: brief §전체 비전, spec.md §Scope

## Context
gootte 가 볼 뿐(reader)인가, cling 을 제어(kickoff/todo/sprint 트리거)하는 control plane 인가. 전체 구조를 먼저 잡아야 나중에 제어를 덧붙임 없이 얹음.

## Decision
**구현 = 관찰 전용(reader). 구조 = 제어 대비.** 제어는 CORE 를 안 건드리는 **별 어댑터 계층**(cling 명령을 *호출*하는 형태 — gootte 가 직접 SoT 를 쓰는 게 아님)으로 예약. phase 1~3 은 reader 만. 제어는 원하는 시점에 어댑터로 삽입.

## Alternatives
- 지금 제어 포함 → auth·안전·실행 파이프라인 대폭 확대, 급한 통증(파악)과 무관. 기각.
- 제어 영구 배제 → 미래 확장 봉쇄. 예약이 안전.

## Consequences
- (+) reader 로 작게 시작, 제어 seam 이 CORE 순수성(INV-1/2)을 침범 안 하게 예약.
- (−) 예약만 하고 미구현 — YAGNI 와 균형(구조 자리만, 코드 X).

## Invariant impact
INV-2(읽기 전용) — 제어 어댑터도 cling *호출*이지 gootte 직접 mutate 아님(호출된 cling 이 SoT 씀).

## Contract impact
없음(phase 1). 제어 어댑터 도입 시 명령 타입 추가.
