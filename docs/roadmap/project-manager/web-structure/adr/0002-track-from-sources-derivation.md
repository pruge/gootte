# ADR-0002: track↔그림 연결 = `sources:` → 이니셔티브 → track 파생

Status: accepted
Date: 2026-07-29 / 관련: spec.md §Data Model · track-grouping ADR-0001(동형 seam)

## Context
"mermaid 를 리스트 track 에 맞춰 본다"가 요구. 그러나 `M-NNNN` frontmatter 필드 = `id·title·status·supersedes·superseded_by·sources·updated` — **`track` 이 없다.** jinwooauto 는 INDEX 프로즈 `### Track` 헤딩으로 묶었고 gootte INDEX 는 flat. track 을 어디서 얻나?

## Decision
그림의 track 을 **파생**한다: `sources:` 배열에서 `docs/roadmap/<initiative>/…` 경로를 찾아 그 **이니셔티브의 track**(정규화 `{key,label}`)을 취한다. 이니셔티브 소스가 없거나(횡단 그림: 아키텍처·토폴로지) 해소 불가면 **`시스템/공통` 그룹**(track=null)으로.

## Alternatives
- **frontmatter 에 `track:` 신설**: external-writer seam(cling writer + gootte reader) 확장 = cling 프레임워크 규약 변경 필요, 기존 52장 재저작 부담. 지금 불필요 — sources 로 파생 가능.
- **INDEX 프로즈 `### Track` 헤딩 파싱**: 프로젝트마다 INDEX 구조 제각각(gootte 는 flat) = 취약. 기각.

## Consequences
- (+) 신규 필드·재저작 0. 기존 `sources:` + 이니셔티브→track 매핑(이미 로드) 재사용.
- (+) 횡단 그림(M-0001 아키텍처, M-0009 토폴로지류)이 자연스럽게 `시스템/공통` 으로 = jinwooauto `### 시스템` 과 동일 감각.
- (−) `sources` 가 여러 이니셔티브면 **첫 해소되는 것**의 track 사용(결정적). 다중 track 그림은 드묾 — 수용.
- 그룹 순서 = `시스템/공통` 먼저(뿌리) → profile `trackOrder`(E·W·R·X) → 미분류 last. 그룹 내 = M-ID 오름차(결정적).

## Invariant impact
- **INV-4** — 파생은 순수·결정적. 지킴.

## Contract impact
`StructureGroup.track: Track | null`(null = 시스템/공통). 신설 필드 없음.
