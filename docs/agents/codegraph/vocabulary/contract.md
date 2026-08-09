# contract — 질의어

`code/web/contract` (zod 계약 SoT). 여러 워크스페이스가 여기서 타입을 파생한다.

> 위치는 **파일 경로만** 적는다. 줄번호는 적지 않는다 — 이유는 [`../README.md`](../README.md)
> §왜 줄번호를 안 적나. 줄이 필요하면 `grep -n "<앵커>" <경로>` 로 그때 뽑는다.

| 한국어 개념어 | 영문 앵커 | 종류 | 위치 | 확인일 | 비고 |
|---|---|---|---|---|---|
| 관리대상 티켓 상태 여덟 값 | `FirstmateStatus` | constant | `code/web/contract/src/index.ts` | 2026-08-09 | `z.enum([...8])`. 화면이 쓰는 다섯 값은 `TodoStatus` 로 따로 있고 원문은 `FeatureTicket.sourceStatus` 에 실린다. 처음엔 `TicketStatus`/`IssueStatus` 로 짐작하기 쉽다 |
