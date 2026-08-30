# per-folder-watch-roots — 감시 폴더를 명시 목록으로 푼다

Status: resolved (2026-08-30)

## 캡틴 지시 (원문)

> **"firstmate가 토큰을 무지막지하게 먹는것을 확인하고 사용을 금지하기로했어."**
> **"이제는 설정창에서 감시해야할 projects 폴더를 사용자가 각각 추가하는 형식으로 변경되어야할꺼 같아."**
> **"더이상 사용하지 않는 사본 projects는 감시목록에서 제거하면 더이상 감시하지 않게."**

## 문제

감시 뿌리는 `Settings.firstmateHome` **하나**에서 `deriveWatchRoots(home)` 가
`<홈>/projects` + 명부의 모든 항해사 홈 `projects` 를 **자동 파생**했다
(`core-io/src/discover.ts:57`, `one-setting-finds-every-copy` T05). firstmate 가 토큰을
무지막지하게 먹어 사용을 금지했으니, gootte 가 firstmate 구조에 종속된 채로 자동 파생하는
것은 더 이상 맞지 않는다 — 감시 대상을 사람이 직접 고르게 한다.

## Goal

감시 폴더를 **사용자가 명시적으로 추가하는 목록**(`watchRoots: string[]`)으로 바꾼다.
목록에서 하나를 빼면 그 폴더(와 그 treehouse 사본)는 더 이상 감시되지 않는다. firstmate
구조에 얽매이지 않는다.

## 설계 결정 (논의에서 정해진 것)

- **`firstmateHome` 은 감시 파생에서 완전히 떼어낸다.** 이제 `watchRoots` 가 감시의 유일한
  주인이다. `firstmateHome` 은 **백로그 조인**(신관례 `tickets/T<NN>.md` 티켓 상태 단일
  출처)에만 쓰인다 — firstmate agent 가 멈춰도 로컬 `backlog.md` 를 읽는 것은 토큰을 안 먹는다.
- **키 부재 vs 빈 배열 구분** — `settingsHasWatchRoots(file)` 가 저장 파일에 `watchRoots`
  키가 있는지 본다. 키가 **없으면**(최초·마이그레이션 전) 기존 파생 규칙 `resolveWatchRoots` 가
  firstmate 홈에서 뿌리를 만들어 내고, 키가 **있으면**(빈 배열 포함) 그 값이 권위다. 빈 배열은
  "아무것도 감시하지 않음". 그래서 기존 동작은 설정 파일을 건드리지 않고 그대로 살고, 사용자가
  목록을 만지기 시작하면 명시 모드로 넘어간다.
- **우선순위** — `resolveWatchRoots` = `watchRoots`(키 있음) → `deriveWatchRoots(firstmateHome)`
  → env `GOOTTE_ROOTS`/플랫폼 기본값 `fallbackRoots`. 매 요청 다시 계산(INV-3, 파생물·결정적).
- **treehouse 사본 게이팅은 공짜** — `scanWorkingCopies(treehouse, project)` 가 **프로젝트별**로
  호출되므로, `discoverProjects(watchRoots)` 가 줄인 프로젝트만 스캔된다. 뿌리에서 빼면 사본도
  자동 제외 — 별도 트리하우스 필터가 불필요하다.
- **unset(`null`)은 키 삭제** — PUT `watchRoots:null` 은 파일에서 키를 지워 파생 규칙이
  되살아나게 한다. `null` 을 그대로 박으면 다음 `readSettings` 가 타입 오류를 낸다(zod 기본값은
  키 부재에만 적용).

## Produces

- `contract` `Settings.watchRoots: string[]`, `SettingsResponse.effectiveWatchRoots: string[]`
  (화면 프리필용 — 실제 감시 중인 뿌리, 응답마다 재계산), `SettingsUpdateRequest.watchRoots`.
- `core-io` `settingsHasWatchRoots`, `resolveWatchRoots`, raw 라운드트립 `writeSettings`.
- `backend` `effectiveRoots` 가 `resolveWatchRoots` 사용, PUT 이 `watchRoots` 정규화 + `onWatchRootsChange` 통보, `server.ts` 가 문서 감시기를 새 뿌리로 재바인딩.
- `frontend` `SettingsDialog` 에 감시 폴더 목록 에디터(추가/삭제), `effectiveWatchRoots` 로 프리필, 그리고 firstmate 홈처럼 **찾아보기** 버튼(`pickFolder`, tauri 전용)으로도 등록.

## Consumers

- `code/web/backend/src/app.ts:152` — `effectiveRoots()` = `resolveWatchRoots(dataDir, fallbackRoots)`
- `code/web/backend/src/server.ts:34` — `currentWatchRoots()` = `resolveWatchRoots(dataDir, roots)`
- `code/web/frontend/src/components/settings/SettingsDialog.tsx` — 목록 에디터
