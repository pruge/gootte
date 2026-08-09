# contract — 질의어

`code/web/contract` (zod 계약 SoT). 여러 워크스페이스가 여기서 타입을 파생한다.

> 위치는 **파일 경로만** 적는다. 줄번호는 적지 않는다 — 이유는 [`../README.md`](../README.md)
> §왜 줄번호를 안 적나. 줄이 필요하면 `grep -n "<앵커>" <경로>` 로 그때 뽑는다.

| 한국어 개념어 | 영문 앵커 | 종류 | 위치 | 확인일 | 비고 |
|---|---|---|---|---|---|
| 충돌 위험도 | `ConflictRisk` | constant | `code/web/contract/src/index.ts` | 2026-08-09 | `z.enum(["low","med","high"])`. 실제 계산은 core-io 의 `conflictRisk()` 함수가 함 → [`core-io.md`](core-io.md). 처음엔 `RiskLevel`/`ConflictLevel` 로 짐작하기 쉽다 |
