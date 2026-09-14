# memos-read-from-any-session — 어떤 세션에서든 자기 프로젝트 메모를 읽는다

## 배경

메모는 화면 `memo` 탭에 이미 있고, 그 안에 `전체/완료/미완료` 필터도 있다. 그런데 **메모를 읽는 통로가
화면 하나뿐**이라 AI 세션이 대화에 쓰지 못한다. 캡틴이 원하는 것은 `gootte memo` — 세션이 자기
프로젝트의 메모를 명령 한 줄로 읽어 **같이 논의**하는 것이다(그릴 라운드 1 은 화면으로 오독해 폐기,
라운드 2 에서 CLI 로 확정 — [`grill.md`](grill.md)).

## 문제

`gootte` CLI 에 메모를 읽는 명령이 없다. 그래서 AI 세션은 메모의 존재를 모른 채 논의하거나, 캡틴이
화면을 옮겨 적어야 한다. 메모는 이미 gootte 자기 저장소에 사람이 정한 값으로 있으니(INV-5) 읽기
통로만 없다.

## Goal

`gootte memo [--done|--undone]` 를 신설한다. **실행한 cwd 의 프로젝트 하나만** 메모 목록으로 낸다 —
내용은 verbatim. **프로젝트 인자는 없다**(`gootte status`·`start`·`end` 와 같은 규율 — 캡틴 지시
2026-09-14: "세션이 진행하고 있는 프로젝트는 기본으로 따로 인자를 주지 않게하자").

## 설계 결정 (그릴에서 확정 — 근거는 grill.md)

- **직접 읽기**: `core-io` 의 `readMemos(dataDir, slug)` 를 그대로 쓴다. 백엔드 API·contract 는
  건드리지 않는다(읽기 전용이고, 화면과 같은 SoT 를 같은 함수로 읽는 것이 INV-1 다).
- **범위**: 현재 프로젝트 하나. "전체 프로젝트" 모드도 **다른 프로젝트 slug 인자도 없다**(캡틴 답).
- **프로젝트는 cwd 로만 정한다**: 기존 `slugFromCwd`(`cli/src/commands.ts:69-78` — 조상에서 발견
  표식을 올라가는 관례) 를 쓴다. 단 `resolveProjectArg` 처럼 **위치 인자를 받아주지 않는다** —
  `memo` 는 위치 인자를 받으면 사용자 오류로 멈춘다("gootte memo 는 지금 프로젝트만 봅니다").
  새 유추 로직을 만들지 않고, 인자 허용 규율만 이 명령에서 좁힌다.
- **필터**: `--done`(완료만) / `--undone`(미완료만) / 없으면 전체. 둘 다 주면 사용자 오류
  (`CliError`) — 모순되는 두 상태를 동시에 물을 수 없다.
- **정렬**: `createdAt` 내림차순, 같은 시각은 저장 순서 유지(안정 정렬). 화면과 같은 규약.
- **출력**(한 메모 한 항목, 개행 포함 content 를 버틴다 — 실측: jinwooauto 23건 중 2건이 다중 줄):

  ```
  == jinwooauto · 메모 23건 (완료 8 · 미완료 15) ==
  - [ ] 2026-09-10 첫 줄 내용
      둘째 줄은 2칸 들여쓰기로 verbatim 그대로
  - [x] 2026-09-09 완료된 메모
  ```

  헤더의 `완료 A · 미완료 B` 는 **필터 이전** 전체 카운트이고, 필터가 걸려 있으면 ` · 필터: 미완료` 를
  헤더에 붙인다 — 잘린 목록을 전체처럼 보이게 그리는 거짓 렌더를 막는다.
- **빈 목록과 고장은 갈라진다**: 파일이 없으면 `== <slug> · 메모 없음 ==` 을 내고 exit 0.
  JSON 이 망가져 파싱이 실패하면 **빈 목록으로 위장하지 않고** stderr 에 원인을 내고 exit 1
  (`memo-store.ts` 의 기존 규율과 같은 얼굴 — "지운 것과 고장 난 것을 같게 그리지 않는다").
- **고아 파일**: cwd 프로젝트가 discover 목록에 없어도(예: 새 저장소) `memos/<slug>.json` 이 있으면
  그대로 출력한다 — 파일 존재가 사실이다. 반대로 프로젝트 **안** 하위 디렉토리에서 쳐도 같은 답
  (`slugFromCwd` 가 조상을 올라가므로).
- **PATH 라우팅이 기능의 일부**: `bin/gootte` 는 지금 시간·상태 외의 명령을 거부한다
  (`bin/gootte:763`). AI 세션은 **자기 프로젝트 cwd** 에서 `gootte memo` 를 친다 — 라우팅 없으면
  화면에서나 보는 명령으로 남는다. `working|pending` 라우트(`bin/gootte:755-762`)가 선례이고, 그 둘과
  달리 **플래그를 TS 계층까지 넘긴다**.

## Produces

- `code/web/core-io/src/memo-select.ts` — 순수 계산(필터·정렬·카운트·포맷). 파일 I/O 는 `memo-store`
  가 소유하고 여기는 문자열 계산만 한다(INV-4: 판정은 계산, 산문 요약 없음).
- `code/web/core-io/src/index.ts` — export.
- `code/web/cli/src/commands.ts` — `memoText(argv, dataDir, cwd)`.
- `code/web/cli/src/main.ts` — `case "memo"` + `usage()` 한 줄.
- `bin/gootte` — `memo` 라우트(인자·플래그 통과) + `usage()` 한 줄.
- 테스트: `core-io` 단위, `cli/src/cli.test.ts`, `scripts/tests/gootte-wrapper.test.sh`(라우트).

## Consumers

- 사람의 셸 · **AI 세션**(자기 프로젝트 cwd 에서 `gootte memo`, 안 끝난 생각만 보려면 `--undone`).

## Explicitly out of scope

- 새 메모 작성·수정·삭제 CLI(쓰기는 화면이 이미 소유. CLI 에 들어오면 `id` 안정성·동시 편집 문제가 붙는다).
- 다른 프로젝트의 메모를 찍는 인자 · 전체 프로젝트 집계 모드(캡틴 답: 현재 프로젝트만).
- 백엔드 API·contract 변경, 화면 `memo` 탭 동작 변경(필터는 이미 있다).
- 검색(화면엔 있다. CLI 는 필터 두 개로 시작하고 검색은 다음 표로 남긴다).

## Verification

`pnpm verify` green. 신규 케이스는 `core-io` 단위(필터·정렬 안정성·카운트·다중 줄 포맷·손상 JSON 구분)와
`gootte-wrapper.test.sh`(PATH 에서 `gootte memo --undone` 가 TS 계층까지 도달).

## 불변식 점검

INV-1·INV-5(저장 0 — 파생 읽기뿐) · INV-2(관리대상 읽기 전용이고 gootte 자기 저장소도 여기서 읽기만) ·
INV-3(매 실행 재읽기, 캐시 없음) · INV-4(내용 verbatim, 요약 금지).
