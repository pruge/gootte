# ADR-0001: track = external-writer seam (하이브리드 파싱, KickoffEvent 동형)

Status: accepted
Date: 2026-07-25 / 관련: spec.md §Data Model, §파싱

## Context
track(대분류)은 관리대상 `ledger.md` 에 적힌다. gootte(reader)는 이를 읽고, cling 프레임워크(writer)는 이를 쓴다 = **cross-repo 공동소유**. blueprint §③가 `KickoffEvent` 으로 이미 이 패턴(external-writer seam)을 세웠다. track 은 두 번째 seam.

## Decision
track 을 **`KickoffEvent` 과 동형의 external-writer seam** 으로 둔다:
- **스키마** = CONTRACT `Track{key,label}` (zod SoT, 버전 박음).
- **저장** = 관리대상 `ledger.md` (frontmatter `track:` 카노니컬, 또는 프로즈 `- 트랙:` 레거시).
- **하이브리드 파싱** — `parseLedger` 가 **frontmatter `track:` 우선, 없으면 프로즈 `트랙:` fallback**. cling 무변경(레거시)으로 즉시 동작, 정형화(frontmatter)는 카노니컬 경로를 열 뿐.
- **paired 외부 변경** = cling writer 규약(`## Tracks` 어휘 + ledger `track:` frontmatter)은 별 작업(이미 편집). gootte phase 를 막지 않음.

## Alternatives
- **gootte-only 정규화(cling 무변경)**: 프로즈만 파싱. → 카노니컬 frontmatter 미지원, write-side 근본(자유서술 흩어짐) 미해결. 기각(하이브리드가 둘 다 흡수).
- **track 을 CONTRACT 밖 프론트 로컬 타입**: 경계(core→backend→frontend) 넘는데 N벌 재선언 → divergence. 기각(seam=CONTRACT).

## Consequences
- (+) 레거시 프로즈 즉시 동작 + 카노니컬 frontmatter 로 무손실 마이그레이션(하이브리드).
- (+) `KickoffEvent` 과 동일 패턴 = 학습·리뷰 비용 0.
- (−) frontmatter/프로즈 **양쪽** 파싱 유지 필요(한쪽만 보면 마이그레이션 중 깨짐) — spec 파싱 규칙이 명시.

## Invariant impact
- **INV-2** — ledger·profile 읽기 전용(track write X). 준수.
- **INV-4** — 파싱·정규화 결정적·LLM-free. label 은 verbatim 릴레이. 준수.

## Contract impact
- **신규** `Track{key,label}`. `PlanItem.track`(string→`Track`)·`GanttRow.track`·`TimelineResponse/PlanResponse.trackOrder`. codegen 재실행 + drift-guard.
