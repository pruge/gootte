# Specification — the-terminal-agrees-with-the-screen

Status: ready-for-agent (2026-08-26)

## 캡틴 지시 (원문, 2026-08-26)

> firstmate나 2ndmate가 다음 할일을 판단할떼 다음을 사용하도록 규칙을 세우자.
> gootte next를 사용하게하자. 이제 steps에 제대로 ticket이 올라오니,
> 너희들과 내가 같은 ticket을 보고 작업중인지도 알수 있게된다.
> 이것은 project quicmic next 이렇게 할수 있게 규칙을 세우자.

## 문제 (실측 2026-08-26, 재현)

신관례(`tickets/T<NN>.md`) 티켓의 상태 단일 출처는 firstmate 백로그이고, 그것을 얹는 자리는
`applyBacklogStatus` 하나다. 그런데 CLI 는 그 조인을 안 지난다.

    $ cd <firstmate홈>/projects && tsx cli/src/main.ts next QuicMic
    menubar-and-installable-app/T01  기억하는 자리를 만든다 (인증서·번호·세션 토큰)
    → T01 은 PR #1 로 2026-08-25 병합됐다. T02·T03 도 병합됐고 남은 것은 T04(캡틴 검수) 뿐이다.

    $ ... board QuicMic
    ## 작업 대상 (1) — T01~T04 전부 열린 것으로 표시

원인(소비처 grep 실측 — 아래 T01 참조): `applyBacklogStatus` 소비는 `backend/src/app.ts` 세 곳뿐,
CLI 는 0곳이다. 문서에는 상태가 없으므로 CLI 신관례 티켓은 전부 미완료로 보인다.

또 하나: CLI 프로젝트 찾기(`resolveProjectPath`, cli/src/commands.ts:25)는 `cwd + defaultProjectRoots()`
(`~/Documents/ai2/projects` 하나)만 본다. 백엔드는 env `GOOTTE_ROOTS`(콜론 구분)를 읽는다
(backend/src/app.ts:69). 그래서 다른 홈의 사본에서는 `프로젝트 없음: QuicMic` 이 난다.

## 결정 (캡틴 승인 2026-08-26)

- 🔴 CLI 의 `board`·`next` 에도 **같은 조인**(`applyBacklogStatus`)을 얹는다 — 판정 자리 원칙대로
  화면과 터미널이 같은 값을 본다. firstmate 홈 경로는 기존 설정 저장소(`settings.json` 의
  `firstmateHome`, dataDir 는 `GOOTTE_DATA_DIR` 관례 동일)에서 읽는다. 새 설정 칸을 만들지 마라.
- 🔴 CLI 도 env `GOOTTE_ROOTS` 를 읽는다 — 백엔드 `effectiveRoots` 와 같은 규칙.
- 홈 미설정·백로그 없음은 빈 목록으로 흡수해 화면과 같이 기운다(조인 실패는 상태 미표시일 뿐).

## 범위 밖

- `project <프로젝트> next` 문(firstmate 쪽 문) 제작 — firstmate 몫, 이 수정과 병렬이다.
- `step` 명령의 상태 조인 — 티켓 존재 확인 용도라 미조인도 참이다. 건드리지 않는다.

## 검증

`pnpm -C code/web verify` green + 실물 CLI 재현 시나리오(QuicMic next 가 T04 만 말하는 것).
