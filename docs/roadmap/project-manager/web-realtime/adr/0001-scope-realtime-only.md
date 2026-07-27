# ADR-0001: scope = 실시간 자동갱신만, .env 로그인은 phase 3로 이관

Status: accepted
Date: 2026-07-27 / 관련: spec.md §Scope, brief.md §scope

## Context
blueprint 2b는 "WS + watcher + .env 로그인"을 묶었다. 그러나 현재 배포는 **localhost 단일 사용자**다. 로그인은 보호할 대상(원격 접근)이 있을 때 값을 갖는데, localhost엔 없다.

## Decision
이 phase = **실시간 자동갱신(watcher + WS push + 클라 invalidate)만**. `.env 로그인`은 **phase 3(remote-mobile — CF 터널 원격 노출)로 이관**. blueprint 2b 행의 "로그인"은 3에서 실현.

## Alternatives
- blueprint 그대로(실시간+로그인 동시): localhost에 값 없는 인증을 지금 구현 = YAGNI.
- 로그인 영구 생략: 원격 노출 시 필수라 완전 생략 불가 → 이관이 맞음.

## Consequences
- 이 phase 집중도↑(하나씩). 원격 노출(phase 3)이 로그인의 자연스러운 트리거.
- WS 엔드포인트는 localhost에서 인증 없이 열림(phase 3에서 auth 게이트 추가).

## Invariant impact
없음(scope 결정, 불변식 무관).

## Contract impact
없음(User/Auth seam은 blueprint 예약 그대로, 이 phase에서 안 건드림).
