# ADR-0002: label 해소 = profile `## Tracks` 어휘(카노니컬) + 프로즈 fallback(레거시)

Status: accepted
Date: 2026-07-25 / 관련: spec.md §정규화 규칙, §파싱

## Context
카노니컬 형식은 ledger 에 `track: C`(key)만 적고 **label 은 profile `## Tracks` 어휘가 소유**(방금 세운 cling 규율). 레거시 프로즈는 `트랙: C — 제어 알고리즘` 처럼 key+label 을 함께 품는다. gootte 가 label 을 어디서 해소하는가?

## Decision
**하이브리드 해소**:
- **카노니컬**(frontmatter `track: <key>`) → gootte 가 `<project>/.cling/profile.md` `## Tracks` 를 읽어 **key→label 해소**. 어휘가 label 의 단일 SoT.
- **레거시**(프로즈 `트랙: <key> — <label>`) → 클린 후 key 추출 + **나머지에서 label 인라인 파생**(verbatim). 어휘 없이도 동작.
- gootte 가 관리대상 profile 을 읽는 **read surface 를 추가**(디스커버리가 이미 profile.md 존재를 확인 — 경로 있음). **읽기 전용**(INV-2).
- 어휘 미선언 프로젝트 → 빈 vocab → 전부 프로즈 fallback 경로(정상).

## Alternatives
- **프로즈만(profile 안 읽음)**: 카노니컬 `track: C` 에 label 못 붙임("C"만) → 백필하면 오히려 label 소실 = 자기모순. 기각.
- **label 을 ledger 에도 중복 기록**: 이중 SoT(어휘 vs ledger) desync. 기각(어휘=단일 SoT).

## Consequences
- (+) write-side(어휘=label SoT)와 정확히 짝 = 단일 SoT(통합 리뷰가 검증).
- (+) 레거시·카노니컬·어휘無 전부 커버.
- (−) gootte 가 profile 파싱 1건 추가(`parseProfileTracks`) — 순수·작음.

## Invariant impact
- **INV-1** — label 은 어휘/프로즈에서 재생성되는 파생물(2차 SoT 없음). 준수.
- **INV-2** — profile 읽기 전용. 준수.
- **INV-4** — 해소 결정적, label verbatim(추론 X). 준수.

## Contract impact
- 없음(해소 로직은 CORE, 계약 형상은 ADR-0001 `Track`). label 은 `Track.label` 로 전달.
