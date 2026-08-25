# core — 질의어

`code/web/core` (순수 함수 — 문서 파싱 + 상태 계산, IO 없음).

> 위치는 **파일 경로만** 적는다. 줄번호는 적지 않는다 — 이유는 [`../README.md`](../README.md)
> §왜 줄번호를 안 적나. 줄이 필요하면 `grep -n "<앵커>" <경로>` 로 그때 뽑는다.

| 한국어 개념어 | 영문 앵커 | 종류 | 위치 | 확인일 | 비고 |
|---|---|---|---|---|---|
| 막힘 해제 계산 | `buildFeatures` | function | `code/web/core/src/project/features.ts` | 2026-08-09 | `(docs: FeatureDocs[]) => Feature[]`. `Blocked by:` 가 전부 resolved 면 `startable` — 파일엔 없는 계산값(INV-1). 처음엔 `computeFeatures`/`FeatureBuilder` 로 짐작하기 쉽다 |
| 처리중 표시 부착 | `applyInProgress` | function | `code/web/core/src/project/in-progress.ts` | 2026-08-09 | `(features, scan) => { features, inProgress }`. 입력이 문서가 아니라 격리 사본 관측이다 |
| 기능 목록 정렬 · 무리 | `rank` | function | `code/web/core/src/project/features.ts` | 2026-08-10 | 🔴 `sort` 로는 안 걸린다 — 영문 앵커가 `rank` 다. 정렬 자체는 `buildFeatures` 안에서 일어나고 `rank` 가 무리(남은 일 있음/티켓 없음/완료)를 정한다. `RANK_OPEN`·`RANK_NO_TICKETS`·`RANK_DONE` 상수의 값이 곧 무리 순서다 |
| 백로그 파서 | `parseBacklog` | function | `code/web/core/src/parse/backlog.ts` | 2026-08-25 | `(content: string) => BacklogTaskDoc[]`. firstmate 홈 `data/backlog.md` 전문 → 절(In flight/Queued/Done)·id·repo·note 로 나눈다(T04) |
| 백로그 상태 조인 | `joinTicketBacklog` | function | `code/web/core/src/project/backlog-join.ts` | 2026-08-25 | `(tasks, repo, featureSlug, ticketNum) => BacklogJoin \| null`. 부모 작업의 메모 안 `docs/features/<slug>/` 문구로 부모를 찾고 `<parent>-t<NN>` 로 자식을 찾는다(D4). `applyBacklogStatus` 가 `Feature.newTickets` 전체에 얹는다 |
| 자동 단계 배정 | `assignSteps` | function | `code/web/core/src/plan/auto-step.ts` | 2026-08-25 | `(tickets) => Map<ticketSlug, step>`. 의존 위상 정렬 — 배정 불가(순환·존재하지 않는 번호·산문)는 9999. 등록 시 심는 값의 계산 자리(steps-start-from-dependencies/T02). 심기 자리는 `planMove` |
