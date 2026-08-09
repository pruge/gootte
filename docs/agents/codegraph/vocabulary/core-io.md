# core-io — 질의어

`code/web/core-io` (파일시스템·git·워크트리 등 I/O 경계).

> 위치는 **파일 경로만** 적는다. 줄번호는 적지 않는다 — 이유는 [`../README.md`](../README.md)
> §왜 줄번호를 안 적나. 줄이 필요하면 `grep -n "<앵커>" <경로>` 로 그때 뽑는다.

| 한국어 개념어 | 영문 앵커 | 종류 | 위치 | 확인일 | 비고 |
|---|---|---|---|---|---|
| 프로젝트 발견 | `discoverProjects` | function | `code/web/core-io/src/discover.ts` | 2026-08-09 | `(roots: string[]) => Project[]`. 처음엔 `findProjects`/`scanProjects`/`ProjectDiscovery` 로 짐작하기 쉽다 |
| 다이제스트 방출 | `emitDigest` | function | `code/web/core-io/src/emit.ts` | 2026-08-09 | `(repoPath, body) => string`. cli 의 `writeDigest` 가 이걸 감싼다 → [`cli.md`](cli.md) |
