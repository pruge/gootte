# ADR-0004: worktree/test 패널 범위 (구조적 — 프로즈 파싱 X)

Status: accepted
Date: 2026-07-25 / 관련: spec.md §Data Model (WorktreeStatus)

## Context
blueprint 2c "worktree 상태·test" 패널. "테스트할 것"은 sprint `## 사용자 테스트`(산문). 어디까지 표시하나.

## Decision
- **구조적 데이터만** — `WorktreeStatus { slug, branch, base, initiative, sprint, signal: GitSignal }`. 소스 = `scanWorktrees` + `computeGitSignal`(loadProjectState가 이미 조립) + worktree↔sprint/initiative 매핑.
- **conflictRisk 색** — GitSignal.conflictRisk(low/med/high) = semantic 색(GitHub checks 룩).
- **"테스트할 것" = 링크**, 파싱 X — 활성 worktree의 sprint doc(`## 사용자 테스트`)로 링크만. 산문 파싱/요약은 안 함(INV-4 — read-path는 verbatim/구조, 산문 재가공 X).

## Alternatives
- sprint `## 사용자 테스트` 산문을 파싱해 체크리스트화 → 취약(포맷 의존)·산문 재가공(INV-4 회색지대). 기각(링크로 충분).
- worktree 없는 상태도 과하게 표시 → 활성 worktree 0이면 빈 상태. 단순.

## Consequences
- (+) 결정적 구조 데이터만 · GitSignal 재사용 · 파서 추가 0.
- (−) "테스트할 것" 상세는 링크 클릭(패널 안 인라인 아님) — 2c 범위로 충분.

## Invariant impact
**INV-4** — 산문(사용자 테스트)은 파싱/요약 않고 링크(verbatim 원칙). **INV-2** — 읽기만.

## Contract impact
신규 `WorktreeStatus` + `WorktreeResponse`(ADR-0003 목록에 포함). 신규 파서 없음(기존 scanWorktrees/GitSignal 재사용).
