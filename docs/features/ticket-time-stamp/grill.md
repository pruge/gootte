# Grill — ticket-time-stamp

> 캡틴과 1:1 대화로 설계가 굳어졌다(2026-08-29). 이 파일은 그 대화에서 확정된 결정을
> 의사결정 로그로만 적는다.

## Goal

티켓 작업 시간을 CLI 명령으로 기록하고, 그 기록을 티켓 문서 자체에 남긴다.
크루든 캡틴이든 같은 명령으로 시작·끝을 찍고, gootte 대시보드가 그 시각에서
걸린 시간을 파생한다. 기존 백로그 메모의 `time:` 줄은 완전 교체한다.

## Decisions

### D1 — CLI 명령 형식은 방안 A(기능 slug 명시)

- 확정: `gootte start <feature-slug> <ticket>` / `gootte end <feature-slug> <ticket>`.
- 캡틴 원문: "방안 a로 하자."
- `T01`이 기능마다 겹치므로(fast-cold-start/T01, ticket-done-from-git/T01, ...)
  기능 slug를 반드시 받는다. 기존 `step` 명령의 `<프로젝트> <기능>/<티켓>` 패턴과
  다르지만 캡틴이 선택한 형식이므로 그대로 따른다.

### D2 — 시간 원천을 백로그에서 티켓 문서로 완전 교체

- 확정: 백로그 메모의 `time: started=... finished=...` 줄은 버린다.
  티켓 문서의 `Time:` 줄이 유일한 시간 원천이 된다.
- 캡틴 원문: "완전 교체하자."
- 기존 `elapsedPhrase` 순수 함수는 그대로 재사용한다 — 입력만 바뀐다.
- `BacklogTaskDoc`에서 `startedAt`/`finishedAt`을 제거하고, 신관례 티켓 파서가
  `Time:` 줄을 읽어 `FeatureTicket`에 직접 싣는다.

### D3 — 커밋은 별도로 안 함

- 확정: `start`/`end` 명령은 티켓 파일만 편집한다. 커밋은 크루나 캡틴의
  다음 커밋(PR)에 묻어간다.
- 캡틴 원문: "따로 commit은 하지 말고 pr에 묻어가게하자."

### D4 — 크루 자동화는 firstmate 규칙으로 전파

- 확정: 크루가 작업을 시작/완료할 때 자동으로 `gootte start`/`end`를 호출하도록
  main firstmate에 규칙을 세우고 각 secondmate에 전파한다.
- 캡틴 원문: "크루는 firstmate에게 지금 결정사항을 알려 규칙을 세우고 각 2nd
  메이트에게 전파하게하자."
- 이 규칙은 gootte 코드가 아니라 firstmate 쪽 작업이다 — 이 기능의 scope 밖이고
  별도로 main firstmate에 전달한다.

### D5 — 독립 셸 스크립트, gootte TS 코드 무의존

- 확정: `start`/`end`는 `@gootte/core`·`@gootte/core-io` 등 TS 모노레포 워크스페이스를
  전혀 참조하지 않는 **독립 bash 스크립트**로 만든다. md 파일을 직접 읽고 `sed`/`grep`으로
  `Time:` 줄만 쓴다.
- 캡틴 원문: "gootte의 다른 코드를 참조하면 안되고, 단독 sh bin으로 만들어야지, md파일읽어서
  status, time을 기록만하면되잖아?" / "gootte로 명칭하게해, gootte start, gootte end 로
  하면되잖아. 명령어를 호출한 곳에서 docs를 찾아 수정하게하면 되니까."
- 이유: TS 워크스페이스 의존(`workspace:*` 프로토콜)이 있으면 `npm i -g`로 모노레포 밖에서
  전역 설치가 안 된다(번들링·bin 필드·의존성 해석 문제). 독립 스크립트면 이 문제가 통째로 없다.
- 명령 이름은 그대로 `gootte start`/`gootte end` — 별도 이름을 안 쓴다.
- 프로젝트 루트는 **명령을 호출한 위치(cwd)에서 찾는다** — `<프로젝트>` 인자를 받지 않는다
  (D1이 이미 이렇게 정했었는데 최초 구현이 임의로 프로젝트 인자를 추가해 어겼다 — 이 결정으로
  바로잡는다).
- `package.json`에 `"bin": { "gootte-time": "./bin/gootte-time" }` 또는 루트 `bin` 필드를
  추가해 `npm i -g .`로 전역 설치 가능하게 만든다(구현 상세는 티켓에서 확정).
- 이전 구현(PR #92, TS CLI 통합)은 이 결정으로 폐기 — 캡틴이 명시적으로 폐기 승인("1번으로 가자").

## Out of scope

- 크루 자동화 규칙 자체의 구현(firstmate 쪽, D4).
- 되짚은 값과 실측한 값을 화면에서 구분하는 것.
- 걸린 시간으로 정렬·집계·통계를 내는 것.
- 구관례(`issues/`) 티켓의 시간 기록.
- gootte의 다른 명령(board/step/next 등)을 전역 설치 가능하게 만드는 것 — 이 범위는 start/end만.
