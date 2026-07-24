# ADR-0003: 상태관리 — TanStack Query + URL state, Zustand 보류

Status: accepted
Date: 2026-07-25 / 관련: spec.md §Invariants

## Context
frontend 상태관리. gootte 웹 데이터(projects/plan/lineage)는 전부 **서버 상태**. Zustand 같은 클라 스토어를 쓸지.

## Decision
| 상태 | 도구 |
|---|---|
| **서버 상태**(projects/plan/lineage) | **TanStack Query** — 캐시·revalidate. 2b WS는 여기에 invalidate로 확장(즉시 반영). |
| **네비 상태**(선택 프로젝트·탭) | **URL search params** — 터널 공유(D2)·북마크. |
| **테마** | 작은 context + localStorage. |

- **Zustand 미사용(보류)** — 서버상태를 클라 스토어에 복제하면 desync = **INV-1 위배**. 진짜 클라 상태(필터·다중패널)가 커지는 **2b+에서 필요 시** 도입(YAGNI).

## Alternatives
- Zustand에 fetch 결과 저장 → 서버상태 복제·수동 동기·desync. 기각(INV-1).
- Redux → 오버킬.

## Consequences
- (+) 서버상태는 TanStack Query가 캐시/무효화 — 2b 실시간이 자연 확장.
- (+) 네비=URL → 공유가능(터널).
- (−) 클라 상태 커지면 2b에서 Zustand 추가 판단(지금 미리 X).

## Invariant impact
**INV-1** — 서버상태 복제 금지를 도구 선택으로 보장(TanStack Query 캐시 = SoT 파생, 별 스토어 아님).

## Contract impact
없음.
