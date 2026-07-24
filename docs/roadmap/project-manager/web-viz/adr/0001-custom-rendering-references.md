# ADR-0001: 커스텀 렌더링 + 레퍼런스 타겟 (라이브러리 미사용)

Status: accepted
Date: 2026-07-25 / 관련: spec.md §Architecture

## Context
칸반·타임라인·supersede 그래프 렌더 방식. 라이브러리(reactflow·frappe-gantt 등) vs 커스텀. 제약: Tabler 아이콘 전용·번들 예산(app <300kb)·anti-template(슬롭 금지).

## Decision
**전부 커스텀 SVG/CSS**, 아래 레퍼런스를 닮게 재현:
| 시각화 | 타겟 | 구현 |
|---|---|---|
| 칸반 | **Linear 보드** | CSS grid 컬럼 + 카드(밀도·chip·count 배지) |
| 타임라인 | **CI 워터폴 룩 / GitHub Projects roadmap** | SVG/CSS 가로 막대(sprint 기간), **날짜축**(cling=날짜 기록, hour-level 불가) |
| 그래프 | **git 커밋 그래프**(GitKraken·`git log --graph`) | SVG 세로 DAG(스파인+엣지) |
| worktree 패널 | **GitHub PR checks / Vercel deploys** | 카드(status·conflictRisk) |

- lineage는 대부분 **체인**(old→new)이라 force 레이아웃 불필요 → 계층 DAG로 충분.

## Alternatives
- reactflow(~100kb) 그래프 → 번들↑ + force 룩(슬롭) + 65엣지 난잡. 기각.
- frappe-gantt/vis-timeline → 라이브러리 룩 + 오버킬. 기각(커스텀 날짜축 SVG로 충분).
- hour-level 축 → sprint/worktree가 날짜만 기록(시각 없음)이라 데이터 소스 없음 → 날짜축. 시각은 future(타임스탬프 캡처).
- 진짜 대규모 인터랙티브 그래프가 필요해지면 그때 라이브러리 재검토(YAGNI).

## Consequences
- (+) dep 0·번들 최소·완전한 디자인 제어(anti-template)·다크 미션컨트롤 정합.
- (+) 레퍼런스가 전부 dev-tool 밀도 미학이라 일관.
- (−) 그래프 레이아웃·타임라인 스케일을 손으로 계산(단위 테스트로 커버).

## Invariant impact
없음 (렌더 방식 — read-path 데이터는 CORE, ADR-0003).

## Contract impact
없음 (렌더 결정 — 타입 없음).
