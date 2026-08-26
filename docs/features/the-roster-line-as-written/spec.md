# Specification — the-roster-line-as-written

## Goal

세컨드메이트 명부를 **실물에 적힌 그대로** 읽는다.
`every-home-reports-its-status` T02 가 만든 명부 파서는 실물 형식을 못 읽어
**착지 이후 한 번도 동작한 적이 없다**. 그 결함을 고친다.

## 문제

`readBacklogTasks(home)` 는 지도부 홈 + 명부에 등록된 세컨드메이트 홈을 함께 읽어야 한다
(`core-io/src/backlog.ts:52`). 그런데 명부 파서가 홈을 하나도 못 찾아서 실제로는 **지도부 홈만**
읽고 있었다. 캡틴 화면에서 세컨드메이트가 진행 중인 티켓이 상태 없이 뜨는 것이 그 증상이다.

## 실측 (2026-08-26)

| # | 사실 | 근거 |
|---|---|---|
| F1 | 종전 규칙은 **줄 전체**가 `home: <경로>` 인 모양만 받았다 | `core-io/src/secondmates.ts` — `const HOME_LINE = /^\s*home:\s*(\S+)\s*$/;` |
| F2 | 실물 명부 줄은 `home:` 이 **괄호 안**에 있고 뒤에 `;` 와 산문이 이어진다 | 아래 §실물 형식 |
| F3 | 그래서 실물 명부 파싱 결과가 **0개**였다 | `readSecondmateHomes("/Users/pruge/Documents/ai2/firstmate2")` → `[]` (실행 출력) |
| F4 | 🔴 시험은 통과했다 — 픽스처를 **지어냈기** 때문이다 | `secondmates.test.ts` 가 `"home: /경로"` 단독 줄을 쓰고, 주석에 "실물 두 줄(2026-08-26) 모양" 이라고 적혀 있었다 (실물을 확인하지 않고 쓴 문장) |
| F5 | `backlog.test.ts` 의 `withRoster` 헬퍼도 같은 지어낸 모양을 썼다 | `matePaths.map((p) => \`home: ${p}\n\`).join("")` |
| F6 | 실물 명부의 `home:` 값은 항상 `;` 로 끝난다 (3줄 전부) | `grep -oE "home: [^;)]+[;)]"` → 세 줄 모두 `.../firstmate2;` |
| F7 | 소비처는 둘뿐이다 | `core-io/src/backlog.ts` (`backlogHomes`), `backend/src/watchers.ts` (`startBacklogWatchers`) |
| F8 | 반사실: 명부만 고쳐도 voice-to-iterm 은 여전히 상태 없음 — 그 홈 행의 `repo` 가 비어 있어서다 | §범위 밖 |

### 실물 형식 (F2, `data/secondmates.md` 에서 그대로)

```
- gootte-mate - gootte 대시보드를 맡는 두 번째 항해사 (home: /Users/pruge/.treehouse/firstmate2-4b2429/1/firstmate2; scope: gootte 대시보드 자체에 관한 모든 일 …; projects: gootte; added 2026-08-26)
```

🔴 **줄 전체가 `home: <경로>` 인 모양은 실물에 존재하지 않는다.**

## 결정

- **D1 — 명부는 지도부가 쓰는 대로 읽는다.** 파서가 형식을 지정하지 않는다.
  명부는 firstmate 가 유지하는 파일이고 gootte 는 읽는 쪽이다.
  읽는 쪽이 못 읽었으면 읽는 쪽을 고친다.

- **D2 — 줄 안 어디서든 `home:` 을 찾되 경로는 구분자 앞에서 끊는다.**
  구분자는 `;`, `)`, 공백. 실물 형식(F6)과 기존 단독 줄 형식을 **둘 다** 받는 상위집합이다.
  착지된 규칙: `const HOME_TOKEN = /home:\s*([^\s;)]+)/;`

- **D3 — 🔴 시험 픽스처는 실물 명부 줄을 그대로 쓴다.** 지어내지 않는다.
  이번 결함의 원인이 지어낸 픽스처였다(F4). 같은 실수를 코드로 막는다.
  기존 단독 줄 시험도 남긴다 — 상위집합임을 고정하기 위해서다.

- **D4 — 나머지 계약은 그대로.** 명부 순서 유지, 중복은 첫 번째만, 빈 값은 후보 아님,
  명부 없음·읽기 실패는 빈 목록. 설정 계약(`firstmateHome` 단수 문자열)도 무변경.

## 불변식

- INV-1 — 홈 목록은 파생물이다. 어디에도 저장하지 않는다.
- INV-4 — 결정적·LLM-free. 정규식 하나로 끝난다.
- INV-U1 — 명부 없음·읽기 실패는 조용히 빈 목록. 지도부 홈만으로 계속 동작한다.

## 범위 밖

- 세컨드메이트 홈 백로그 행의 `repo` 칸을 채우는 일 (F8).
  그것은 **그 홈의 기록**이고 이 저장소의 코드 문제가 아니다.
  두 가지가 다 되어야 화면이 맞지만, 여기서 고치는 것은 이쪽 절반뿐이다.
- 명부 파일 형식 변경. 명부는 firstmate 의 것이다.
- `contract` 의 `firstmateHome` 단수 계약 변경.

## 착지

- T01 — PR #75 (`76a3ec9`), verify 858 green.
  실물 확인: `readSecondmateHomes(지도부 홈)` → 홈 3개, `readBacklogTasks(지도부 홈)` 89 → 128행.
