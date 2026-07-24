# ADR-0001: 2a 웹 셸 scope — blueprint phase 2 분할

Status: accepted
Date: 2026-07-25 / 관련: brief §scope, ../blueprint.md

## Context
blueprint phase 2 = backend+watcher+frontend(칸반·Gantt·그래프)+auth+자동발견 = 3~4 sprint 큰 덩어리. 한 spec에 다 넣으면 비대·worker-stall·리뷰난. 각 시각화(칸반/Gantt/그래프)는 설계 무게가 큼.

## Decision
phase 2를 **2a/2b/2c로 분할**, 이 kickoff = **2a 웹 셸**:
- backend(Hono) CORE projections JSON 서빙 + React read-only 렌더(목록→plan/lineage). localhost·no-auth·poll.
- **2b** = WS/watcher(즉시)+.env auth · **2c** = 칸반/Gantt/시각 supersede 그래프/worktree/test.
- 전체 그림은 blueprint에 이미 있으니 append 아님 — 셸 위에 얹기(덕지덕지 방지).

## Alternatives
- 풀 phase 2 한 spec → 비대·리뷰난·리스크. 기각.

## Consequences
- (+) 파이프라인(CORE→HTTP→React) 먼저 증명 → 2b/2c가 안정된 셸에 얹힘.
- (+) 각 리치 뷰가 자기 phase = 설계 집중.
- (−) 웹이 3 phase로 늘어남(단 blueprint 로드맵에 반영).

## Invariant impact
없음(scope 결정).

## Contract impact
없음(2a는 CONTRACT 소비만 + API envelope).
