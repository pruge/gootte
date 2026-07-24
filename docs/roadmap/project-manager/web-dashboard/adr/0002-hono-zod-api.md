# ADR-0002: Hono + zod-validator API seam (CONTRACT end-to-end)

Status: accepted
Date: 2026-07-25 / 관련: spec.md §Data Model

## Context
backend 프레임워크 + API 타입 안전. CORE projections를 프론트에 서빙하되 타입이 갈라지면 안 됨(어휘 divergence).

## Decision
- **Hono** — TS-native·초경량. `@hono/node-server`로 로컬 Node 실행, 나중에 CF Workers 포팅 쉬움(D2 터널/미래 정합).
- **`@hono/zod-validator`** — API 응답을 **CONTRACT zod 스키마로 검증** 후 반환. req 파라미터도 zod.
- **API 타입 = CONTRACT 타입 그대로**(`PlanItem`·`Supersession`·`DropRecord`·`Project`). frontend가 같은 `@gootte/contract` import → **end-to-end 타입안전, 재선언 0**.
- **API envelope도 CONTRACT** — `ProjectsResponse`·`PlanResponse`·`LineageResponse`·`ApiError`. envelope는 backend가 생산·frontend가 소비하는 **HTTP 경계 공유 응답 타입** = cross-boundary seam → CONTRACT에 정의(소비처 파생). "phase 국소"로 두면 양쪽이 `{plan,rationale}` 등을 각자 재선언 → 어휘 divergence(계약-SoT가 막는 그것). (kickoff-review B1.)

## Alternatives
- express → 무겁고 TS DX 약함. fastify → 좋지만 Hono가 더 경량+포팅성. tRPC → 오버킬(read-only 3라우트).

## Consequences
- (+) 프론트/백 타입 한 SoT(CONTRACT). 스키마 변경 = 양쪽 자동.
- (+) Hono 포팅성 = 3차 터널/Workers 옵션 열림.
- (−) Hono 생태계가 express보다 작음(문제 안 됨 — 라우트 최소).

## Invariant impact
INV-4 — backend는 CORE 릴레이(서버 LLM 0) · INV-2 읽기.

## Contract impact
CONTRACT 확장 — **API envelope 4종 추가**(`ProjectsResponse`·`PlanResponse`·`LineageResponse`·`ApiError`). 기존 도메인 타입(`PlanItem`·`Supersession`·`DropRecord`·`Project`)은 소비만.
