# Grill — ticket-done-from-git

> 캡틴과 1:1 대화로 설계가 이미 굳어졌다(2026-08-28). 이 파일은 그 대화에서 확정된 결정을
> 의사결정 로그로만 적는다 — 새로운 질문은 없었다. 미해결 결정은 없음.

## Goal
신관례(`tickets/T<NN>.md`) 티켓의 "완료" 판정을 firstmate 홈 백로그 조인(**join**)에서
**`origin/main` git 히스토리 파생**으로 바꾼다. 캡틴이 외부 클론에서 개발해 main 에 머지하면
gootte 대시보드가 알아서 완료로 바뀌고, 항해사(secondmate)에게 매번 완료 처리를 부탁할 필요가 없다.

## Decisions

### D1 — 완료의 단일 출처는 git 이지 백로그가 아니다
- 확정: 티켓 완료 여부 = `origin/main` 에 그 티켓을 가리키는 커밋이 **도달 가능(reachable)** 한가.
- 백로그 조인(`backlog-join.ts`의 `applyBacklogStatus`)은 신관례 티켓 상태 원천에서 빠진다.
- 구관례(`issues/<NN>.md`)는 건드리지 않는다 — 그쪽 상태 출처는 이미 문서 자체(D2 이전 관례).

### D2 — 증분·캐시 스캔, SHA 게이트
- 확정: 매 앱 기동마다 git 을 다 훑지 않는다.
- done-set 을 디스크(영구 스냅샷 저장소)에 캐시. 기동 = 캐시 읽기 + `git rev-parse origin/main`
  한 번(SHA 비교, 마이크로초). SHA 변함없으면 git 작업 0.
- SHA 가 바뀌면 **증분** 스캔: `git log <lastSHA>..origin/main` 만 본다. 비용 = push 당 새 커밋 수.
- fast-cold-start 의 `snapshot-revalidator`(T04)가 이미 부팅 후 배경 재검증 + 저장소 변동 감지를
  하고 있으므로, 티켓 리졸버는 그 트리거를 재사용한다(새 per-launch 비용 없음).

### D3 — 커밋↔티켓 연결 규칙
- 확정: 커밋 메시지 본문/제목에 `T<NN>` 토큰이 있으면 그 티켓을 가리킨다.
- 캡틴 커밋 스타일이 이미 `feat(fast-cold-start): T05 ...` 처럼 `T05` 를 쓴다 — 추가 규칙 없이 통함.
- 스쿼시 머지 시 스쿼시 커밋 메시지에 `T<NN>` 이 들어가야 함(권장: PR 제목에 티켓 번호).
- 선택적 trailer `Closes: T05` / `Ticket: T05` 도 동일하게 매칭(리졸버가 둘 다 본다).

### D4 — 트리거는 재검증기에 매단다 + clone 이 origin 을 fetch 한다
- 확정: `snapshot-revalidator.run()` 이 `git fetch origin` 을 먼저 하고, `origin/main` SHA 가
  바뀌면 리졸버 캐시를 무효화·재계산한다.
- goette 가 읽는 clone 이 push 를 보려면 fetch 가 필요하다 — 재검증기가 그 책임을 이미 일부 지므로
  거기에 fetch 를 붙인다. `headCommit(repo)`(로컬 HEAD)가 아니라 **`origin/main`** SHA 를 기준으로
  삼는다(fetch 만으로는 로컬 main 이 안 굴러가므로).

### D5 — 하이브리드 폴백: 문서/검수 티켓은 문서 상태를 쓴다
- 확정: 구현 커밋이 없는 티켓(종류 docs/검수, 예: `one-setting-finds-every-copy-t06` 종착 검수 티켓)
  는 #2 단독으로는 자동 완료되지 않는다.
- 해법: 신관례 티켓 문서(`tickets/T<NN>.md`)에 **선택적 `Status:` 줄**을 읽는다(구관례 `parseTicket`의
  `parseStatusLine` 과 같은 방식). 문서에 명시적 상태가 있으면 그것이 출처(문서가 SoT), 없으면 git 리졸버.
- 코드 티켓은 git, 문서/검수 티켓은 문서 — 둘 다 백로그 조인 없이 판정된다.

### D6 — 전이(transition)는 자연스럽다
- 확정: 이미 main 에 있는 완료 티켓들은 커밋 메시지에 `T<NN>` 이 있으므로 리졸버가 자동으로 완료로 잡는다.
- 기존 백로그 기록과 충돌하지 않음(백로그는 기획/의존성 추적용으로 남기되 완료 판정 권한은 git 이 가짐).

## Out of scope
- 되돌림(revert) 된 티켓의 자동 미완료 — 이후 작업(지금은 수동/문서 상태로 커버).
- 백로그 조인 자체의 제거 — 기획·의존성 추적에는 그대로 둔다. 완료 판정 원천만 바뀐다.
- 캡틴이 직접 누르는 "지금 재검증" 버튼 — D2 의 배경 fetch 주기로 충분하므로 1차 범위 밖.
