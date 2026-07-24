# ADR-0003: 기존 파싱-버림 데이터 배선 (재발명 아님, 흘리기)

Status: accepted
Date: 2026-07-24 / 관련: spec.md §Reuse map, Task Breakdown

## Context
phase 1 은 정렬만 하고 lineage 를 안 채웠다. 실측: `parseLedger` 가 `supersedes[]` 를 파싱하는데 `buildState` 가 버림 · `TodoItem` 에 `resolvedBy/source` 필드 없어 drop/spawn 유실 · `parseIndex` 가 Supersession 섹션 안 읽음 · `parseAdr` 는 존재하나 `loadProjectState` 가 안 부름. 데이터·파서는 대부분 있고 **배선만 빠짐**.

## Decision
새 파서 최소, **기존 것 배선/확장**:
1. `TodoItem` += `resolvedBy`·`source` (parseTodo 확장).
2. `parseIndex` += Supersession 섹션 파싱(`Supersession[]`).
3. `loadProjectState` 가 `adr/*.md`+`adr/_superseded/` 읽어 `parseAdr` 로 → state 입력.
4. `buildState` 가 `ledger.supersedes`·Supersession·ADR·todo resolvedBy(drop)·source(spawn) 를 `LineageEdge` 로 채움 + timeline/drops.

## Alternatives
- 새 lineage 파이프라인 신설 → 재발명(파서 중복). 기각 — 있는 것 흘리기가 최소.

## Consequences
- (+) 최소 코드로 큰 체감(127 supersede·43 drop 이 즉시 살아남).
- (−) TodoItem/LineageEdge 확장 = phase 1 타입 변경(하위호환 — optional 필드).

## Invariant impact
INV-1/2 유지(읽기·파생). INV-4(결정적) 준수.

## Contract impact
`TodoItem`·`LineageEdge` 확장 + `Supersession/DropRecord/TimelineEvent` 신규(ADR-0001 과 함께).
