# cli — 질의어

`code/web/cli` (CLI 배선 — argv 파싱 + IO → core → text).

> 위치는 **파일 경로만** 적는다. 줄번호는 적지 않는다 — 이유는 [`../README.md`](../README.md)
> §왜 줄번호를 안 적나. 줄이 필요하면 `grep -n "<앵커>" <경로>` 로 그때 뽑는다.

| 한국어 개념어 | 영문 앵커 | 종류 | 위치 | 확인일 | 비고 |
|---|---|---|---|---|---|
| 다이제스트 쓰기 | `writeDigest` | function | `code/web/cli/src/commands.ts` | 2026-08-09 | `(repoPath) => string`. 내부에서 core-io 의 `emitDigest` 호출 → [`core-io.md`](core-io.md). 처음엔 `runCli`/`cliMain`/`DigestWriter` 로 짐작하기 쉽다 |
