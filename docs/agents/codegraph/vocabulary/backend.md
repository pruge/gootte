# backend — 질의어

`code/web/backend` (Hono 서버 + 실시간 이벤트 허브).

> 위치는 **파일 경로만** 적는다. 줄번호는 적지 않는다 — 이유는 [`../README.md`](../README.md)
> §왜 줄번호를 안 적나. 줄이 필요하면 `grep -n "<앵커>" <경로>` 로 그때 뽑는다.

| 한국어 개념어 | 영문 앵커 | 종류 | 위치 | 확인일 | 비고 |
|---|---|---|---|---|---|
| 앱 생성(라우팅 조립) | `createApp` | function | `code/web/backend/src/app.ts` | 2026-08-09 | `(options?: AppOptions) => Hono`. 처음엔 `buildApp`/`AppServer` 로 짐작하기 쉽다 |
| 실시간 이벤트 허브 | `LiveHub` / `createLiveHub` | interface / function | `code/web/backend/src/live.ts` | 2026-08-09 | `createLiveHub(): LiveHub`. 처음엔 `RealtimeStore`/`LiveStore` 로 짐작하기 쉽다(둘 다 코드에 없음, grep 확인) |
