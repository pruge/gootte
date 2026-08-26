# Specification — every-home-reports-its-status

Status: ready-for-agent (2026-08-26)

## 캡틴 지시 (원문, 2026-08-26)

> 2ndmate도 네 사본을 보게가능해? 각자 사본을 가지고 있으면 내가 확인이 가능한가?

> 이렇게하자. firstmate의 폴더릴 지정하면, 나머지는 자동으로 projects 폴더를 감시하게하자.
> 2ndmate는 네말대로 자동으로 찾고.

캡틴이 A안을 고르셨다: gootte 가 지도부 홈뿐 아니라 **등록된 세컨드메이트 홈의 백로그까지 함께 읽는다.**

## 문제

신관례 티켓의 상태 단일 출처는 firstmate 백로그다. 그런데 읽는 홈이 **하나뿐**이라
세컨드메이트가 한 일은 캡틴 화면에서 상태가 안 뜬다.

실측(2026-08-26, 두 홈 백로그를 합쳐 실제로 조인해 봤다):

    main tasks: 66 | mate tasks: 3
    a-vanished-card-breaks-nothing      T01 join → NULL
    the-terminal-agrees-with-the-screen T01/T02 join → NULL

즉 세컨드메이트가 만든 기능은 캡틴께 **티켓이 있다는 것만 보이고 누가 어디까지 했는지는 안 보인다.**

## 🔴 함께 고쳐야 하는 것 — 안 하면 오늘 고친 것이 도로 깨진다

홈을 여럿 읽게 되면 `findParentId`(core/src/project/backlog-join.ts:27)가 **첫 일치 항목**을
부모로 삼는 지금 규칙이 위험해진다. 그 함수는 메모에 `docs/features/<slug>/` 문자열이 있으면
무엇이든 부모 후보로 본다 — **산문 속 인용까지 포함**한다.

실측(합치는 순서만 바꿔 돌린 결과):

    needle = docs/features/both-conventions-are-first-class/
    MAIN 이 가진 것: gootte-both-conventions, -t03, -t02, -t01
    MATE 가 가진 것: gootte-backlog-join   ← 메모 산문이 그 경로를 인용할 뿐, 부모가 아니다

    main-first: parent=gootte-both-conventions → T01 done      (정상)
    mate-first: parent=gootte-backlog-join     → T01 NULL      (🔴 오늘 고친 표시가 사라짐)

그러므로 이 기능은 **읽는 홈을 늘리는 것과 부모 판정을 견고하게 하는 것이 한 벌**이다.

## 결정 (캡틴 승인 2026-08-26)

- 🔴 **보여줄 저장소는 지도부 사본 하나뿐이다.** 홈마다 자기 `projects/` 사본이 있어(실측: 지도부 6개,
  gootte-mate 1개, dictation-mate 3개) 전부 감시하면 같은 이름이 여러 번 뜨고 어느 사본이 진짜인지
  화면이 말할 수 없게 된다. **문서는 한 벌, 상태는 여러 홈** — 이것이 이 기능의 형태다.
- 🔴 **세컨드메이트 홈 목록은 설정에 새 칸을 만들지 않고 자동 발견한다.**
  `<firstmateHome>/data/secondmates.md` 의 `home: <경로>` 값을 읽는다. 지도부가 이미 유지하는
  단일 출처이고, 설정 계약(`contract/src/index.ts` 의 `firstmateHome` 단수 문자열)을 안 건드린다.
- 🔴 **부모 후보는 부모 모양인 것만.** 자식 id 모양(`...-t<NN>`)은 부모가 될 수 없고,
  같은 needle 을 가진 후보가 여럿이면 **지도부 홈이 먼저**다.
- 홈 안에서의 우선순위는 기존대로 live > archived. 새 규칙은 홈 사이 우선순위뿐이다.
- 홈 미설정·파일 없음·명부 없음은 전부 빈 목록으로 흡수한다(INV-U1 방향 유지) — 조인 실패는
  상태 미표시로만 드러나고 판이나 명령을 죽이지 않는다.

## 🔴 왜 완료 기록이 사라질 수 있나 (규율로 막는다, 코드 밖)

세컨드메이트 홈은 `.treehouse` 임대 폴더이고 `data/` 는 gitignore 라 저장소에 사본이 없다.
은퇴 절차는 홈을 통째로 제거하므로 그 홈에만 있던 완료 기록은 영구 소실되고, 이 기능이 붙여 준
상태 표시도 함께 사라진다.

그래서 **완료된 항목은 완료 시점에 지도부 백로그로 이관한다** — 은퇴 시점이 아니다.
이것은 코드가 아니라 함대 규율이고, 지도부에 전파를 요청했다. 이 기능은 그 규율을 전제로 한다:
세컨드메이트 홈에서 읽는 것은 **진행 중** 상태가 주된 값이다.

## 범위 밖

- 세컨드메이트 홈의 `projects/` 사본을 보여주기 — 위 결정대로 하지 않는다.
- 완료 항목 이관 자동화 — 함대 규율이고 도구(`tasks-axi mv`)가 이미 있다.
- 설정 스키마를 홈 목록으로 바꾸기 — 자동 발견으로 충분하므로 계약을 건드리지 않는다.

## 검증

`pnpm -C code/web verify` green + 실물: 지도부 홈만 지정한 상태에서 세컨드메이트가 만든 기능의
티켓 상태가 화면과 `next`·`board` 에 뜬다.
