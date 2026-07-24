# ADR-0002: 데이터 탭 + 뷰모드 토글 (UX 구조)

Status: accepted
Date: 2026-07-25 / 관련: spec.md §Components, wireframe.md

## Context
2a = `plan | lineage` 탭. 2c가 칸반·타임라인·그래프·worktree를 얹을 때 탭 구조. 플랫 N탭 vs 그룹핑.

## Decision
- **상위 탭 = 데이터 축**(2a 유지): `plan` · `lineage` · **`worktree`**(신규).
- **뷰모드 토글 = 표현**(같은 데이터의 여러 보기):
  - `plan` → **[리스트 | 보드 | 타임라인]** (같은 plan projection 소비)
  - `lineage` → **[체인 | 그래프]** (같은 lineage 소비)
  - `worktree` → 단일(패널)
- **URL** `?p=<slug>&tab=<plan|lineage|worktree>&view=<mode>` — 뷰모드까지 공유가능(터널). 009 `useUrlState` 확장.

## Alternatives
- 플랫 5탭(plan·board·timeline·lineage·graph) → 탭 폭발 + 같은 데이터가 분산돼 보임. 기각.
- 별도 bento overview 페이지 → 밀도↑·좁은 화면 부담. 기각(2c는 뷰 확장, 새 페이지 아님).

## Consequences
- (+) projection 구조(plan→list/board/timeline, lineage→chain/graph)와 1:1 매핑.
- (+) 탭 폭발 없이 확장 · URL로 뷰모드 공유.
- (−) 뷰모드 상태를 URL에 추가(useUrlState 확장) — 소폭.

## Invariant impact
없음.

## Contract impact
없음 (URL/UI 상태 — 서버 타입 아님).
