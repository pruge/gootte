# ADR-0001: 보드 = 저작 `docs/mermaid/` 렌더 (import 자동추출 X)

Status: accepted
Date: 2026-07-29 / 관련: spec.md §Architecture

## Context
plan 보드를 코드 구조 그림으로 바꾼다. 구조를 얻는 소스 후보 3:
- **가** 프로젝트 저작 `docs/mermaid/`(`M-NNNN`) 렌더
- **나** `package.json`/빌드파일 import 자동추출
- **다** 하이브리드

## Decision
**가** 채택 — 관리대상 프로젝트가 손으로 저작한 `docs/mermaid/` 다이어그램을 gootte 가 읽어 렌더한다.

## Alternatives
- **나(자동추출)**: 항상 정확하나 언어/빌드별 파서(TS·Kotlin·Gradle…) 필요 = gootte 의 "cling **문서** SoT reader" 정체성·**non-goal(임의 소스 파싱)** 위반. 파일 수백이면 노이즈.
- **다(하이브리드)**: 복잡도만 늘고 지금 가치 없음(YAGNI).

## Consequences
- (+) gootte 기존 자산(mermaid 파서·INDEX 규약·MermaidBlock) 거의 재사용 = 얇은 구현.
- (+) 저작 그림은 import 그래프보다 더 의미 있는 구조(경계·불변식·의도) 표현.
- (−) 그림은 사람이 갱신 → 코드와 드리프트 가능. 수용: 저작 SoT 규약(mermaid INDEX)이 프로젝트 쪽에서 이미 이를 관리.
- 그림 없는 프로젝트 = 빈 상태(empty). 자동 골격 생성은 non-goal.

## Invariant impact
- **INV-2**(read-only) — `docs/mermaid/` **읽기만**. 지킴: core-io 는 read, gootte 는 `.gootte/` 밖 write 0.
- **INV-4**(결정적·LLM-free) — 파싱·추출·그룹핑 전부 순수 함수. 지킴.

## Contract impact
신규 `StructureDiagram`/`StructureGroup`/`StructureResponse`(spec §Contracts). `BoardResponse`/`KanbanColumn` 제거(ADR-0003).
