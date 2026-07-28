# ADR-0003: 칸반 완전 교체 + web-viz 부분 supersede

Status: accepted
Date: 2026-07-29 / 관련: web-viz/spec.md(부분 supersede) · spec.md §Scope

## Context
"보드를 구조로 **변경**"(교체). 그러나 `buildKanban` 은 **web-viz phase([M-0003](../../../mermaid/INDEX.md#M-0003))가 소유**한 산출물. 교체 = 그 산출물 일부를 걷어냄 = supersede 사건. 한편 칸반의 착수-준비도(진행중/착수가능/선행대기)는 **리스트 뷰가 이미 흡수**해 잘 보여줌(중복).

## Decision
칸반을 **완전 교체**(둘 다 유지 X). 제거 대상:
- `core/project/kanban.ts` `buildKanban` + `kanban.test.ts`
- `frontend/components/board/` (`BoardView`·`BoardCard`)
- `backend` `/api/board/:slug`
- `frontend/lib` `useBoard` · `api` board fetch
- `contract` `BoardResponse` · `KanbanColumn`

**보존**: `core/project/partition.ts`(`partitionInitiatives`) — `buildPlan` 이 공유(DRY). 칸반 제거와 무관.

web-viz 는 **부분 supersede**: 걷힌 것 = 칸반(`buildKanban`·board 뷰). 생존 = Gantt(`buildGantt`·타임라인)·lineage viz·나머지 viz projection. web-viz/spec.md 상단에 부분 supersede 배너 1줄.

## Alternatives
- **둘 다 유지(구조를 새 4번째 모드로 add)**: 코드 삭제·supersede 0(리스크 최소)이나 사용자가 "리스트가 준비도 흡수 → 교체" 명시. 칸반 잔존 = 죽은 축.
- **교체하되 준비도를 리스트 배지로 이전**: 이미 리스트가 흡수 중 → 추가 작업 불요.

## Consequences
- (+) 죽은 축 제거 = 뷰모드 3개 유지(리스트/구조/타임라인), UI 단순.
- (−) 착수-준비도의 **명시적 3파티션** 뷰는 사라짐. 수용: 리스트가 흡수(사용자 확인).
- 뷰모드 id `board` → `structure`, 라벨 `보드` → `구조`. URL `?view=board` 은 fallback(`planMode` 이 미지 값→list) 로 안전.

## Invariant impact
- 없음(제거는 불변식 무관). 신규 코드(§ADR-0001·0002)가 INV-2·4 준수.

## Contract impact
`BoardResponse`·`KanbanColumn` **제거** + `StructureResponse` 신설 → codegen 재실행 · drift-guard diff 0.
