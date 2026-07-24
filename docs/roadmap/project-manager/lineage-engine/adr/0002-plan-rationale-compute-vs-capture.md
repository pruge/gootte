# ADR-0002: plan+rationale 1급 산출물 — ordering(B2) · conflictRisk(B1) · trigger 하이브리드

Status: accepted
Date: 2026-07-24 / 관련: spec.md §Data Model

## Context
gootte 핵심 산출 = "개발해야 할 순서(full) + 왜"(사용자 샘플). `cling:sprint`(다음 1개)의 상위집합. 순서·근거의 대부분은 데이터로 계산, re-kickoff 인과(trigger)만 캡처. kickoff-review 가 B1(conflictRisk 계산법)·B2(ordering 랭킹)을 미해결로 지적 → 본 ADR 이 확정.

## Decision
`plan`(PlanItem[])·`rationale`(PlanRationale) = CORE 1급 projection. 근거를 **계산 vs 캡처**로 분리:
- **계산**(cling SoT + git): 순서(B2), NOW(worktree in_progress), 상태(review/todo count), 독립(DAG), 정지점, 방치비용(B1).
- **캡처**(nullable): re-kickoff `trigger` — blueprint 기록계약 하이브리드(구조화 `## events` 있으면 파싱, 없으면 산문 fallback, 없으면 생략).

**B1 — conflictRisk** = **순수 git primitive**(core-io) `conflictRisk(base,mainTip,wtTip)` = `git merge-tree` dry-run(충돌→high / overlapFiles≠∅→med / 없음→low); per-initiative 조립은 projections(state 의 worktree↔initiative 매핑). (대안: 파일겹침 카운트 임계 — 부정확, 기각.)

**B2 — ordering** = 3-분할(active/ready/blocked) + 정렬(active·방치비용순 → 의존체인 → ready 독립+설계완결은 정지점으로 뒤 → blocked sink). 동률=priority→INDEX 순서. **설계완결 = measurable proxy**(`spec.md 존재 + todo 분해됨 + 활성 worktree 없음`; kickoff-review 는 파일 마커 없음). (대안: 순수 위상정렬 — 샘플의 "독립+닫힘→뒤로"·"방치비용 우선" 재현 못함, 기각.)

## Alternatives
- 전부 캡처(cling 구조필드 선행) → blueprint external-writer seam 하이브리드로 대체(ADR-0004).
- 전부 LLM 합성 → 비결정·검증난. 계산 가능한 건 계산.

## Consequences
- (+) 근거 대부분 결정적 계산 → vitest 검증. git merge-tree = "머지 험해짐" 정량화.
- (+) B2 3-분할이 샘플 ①②③④ 를 규칙으로 재현.
- (−) `trigger` 정확도가 소스(구조화>산문) 품질에 의존.

## Invariant impact
INV-3(항상 현재 반영) — plan/rationale = 호출 시 재계산.

## Contract impact
`PlanItem`·`PlanRationale`·`GitSignal(conflictRisk)`·`KickoffEvent(trigger nullable)` = blueprint seam. phase 1 스캐폴드.
