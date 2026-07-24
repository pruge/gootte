# ADR-0001: 부분 supersede 모델 — LineageEdge 확장

Status: accepted
Date: 2026-07-24 / 관련: spec.md §Data Model

## Context
jinwooauto supersede 는 단순 X→Y 가 아님. 실측: `algorithm-device-selection` = "슬롯 mode 는 대체, 엔티티/스코프는 유지"(부분). ledger 에 "참조됨(소비, supersede 아님)" 도 명시 — 소비 ≠ supersede. 단순 supersede 엣지로는 오판(전부 폐기로 보임).

## Decision
`LineageEdge` 를 확장(blueprint seam 확장, 재등록 아님):
```
kind: supersede | supersede-partial | spawn | dep | reference
note?: string   // verbatim 왜 (요약 X — ADR-0002)
adr?: string[]  // 근거 앵커
```
- **부분 판정 = 결정적 키워드** — ledger supersede 텍스트에 "부분/유지/살/생존" → `supersede-partial`. "참조됨/소비" → `reference`. 없으면 `supersede`.
- `note` = 원문 그대로(무엇이 유지·폐기인지 사람이 읽음). `adr` = ADR-N 배열.

## Alternatives
- 단일 `supersede` kind → "부분·참조됨"을 뭉개 전부 폐기로 오판. 기각.
- LLM 으로 부분여부 판정 → 비결정(ADR-0002 위배). 키워드 규칙이 결정적.

## Consequences
- (+) "무엇이 살고 무엇이 죽나"·"참조 vs 대체"가 그래프에 정확히.
- (−) 키워드 판정은 근사 — 애매하면 `note` verbatim 이 진실(사람이 판단). kind 는 힌트.

## Invariant impact
INV-4(결정적·verbatim) 준수 — 판정=키워드(결정적), 왜=verbatim.

## Contract impact
`LineageEdge` 확장(kind 추가·note·adr). blueprint seam 확장 — phase 1 이 심은 타입에 필드 add.
