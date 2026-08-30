# block-working-copies — 화면에서 작업 가지를 숨긴다

Status: resolved (2026-08-30)

## 캡틴 지시 (원문)

> **"폴더를 삭제하는 것보다 gootte에서 더이사 알람을 보이지 않게 삭제? block 하게할수는 없을까? 문제가 될때마다 이렇게 요청해서 삭제하는게 불편한데."**

## 문제

격리 사본(트리하우스 worktree)을 gootte 가 **읽기만** 한다(INV-2 — 관리대상도 트리하우스도
안 건드린다). 그래서 stale 한 crew(예: jinwooauto `fm/program-placement-follows-wiring-t01`,
티켓 미상·작업중)가 뜰 때마다 캡틴은 직접 `~/.treehouse` 의 worktree 를 `git worktree remove`
로 지워야 했다. 삭제는 파괴적이고 번거롭다 — gootte 에 그 복사본을 **보지 않겠다**는
사용자 결정 자리가 없었다.

## Goal

gootte 자기 저장소(`~/.gootte`, INV-5)에 **차단 목록**(`blockedCopies: string[]`)을 두고,
그 slug(`<풀>/<슬롯>`)에 해당하는 작업 가지를 read-time 필터로 화면에서만 숨긴다. 실제
worktree 는 그대로 남는다(삭제하지 않음). 설정 대화상자의 "차단한 작업 가지" 목록에서 해제할 수
있고, 기능 탭의 미해소 카드에 붙은 "숨기기" 버튼으로 바로 추가할 수 있다.

## 설계 결정

- **차단은 사용자 결정 → gootte 자기 저장소(INV-5).** `blockedCopies` 는 어디 문서에도 없는
  "이 복사본은 더 보지 않겠다" 는 값이라 저장할 자격이 있다. 기존 `Settings` 칸(`firstmateHome`
  ·`watchRoots`)과 같은 자리 — `settings.json` 하나에 모인다.
- **read-time 필터, 저장 안 함(단순).** `inProgressFor` 가 서빙할 때마다 `readSettings` 로
  차단 집합을 다시 읽어 `CopyScan.copies` 를 거른다. 캐시(mem/disk)엔 안 필터된 원본을 두므로
  차단을 풀면 즉시 다시 뜬다. 파생물·결정적(INV-3·INV-4).
- **트리하우스는 안 건드린다(INV-2).** gootte 는 여전히 관측만 한다 — 차단은 화면 표시 레이어일
  뿐, worktree 를 지우거나 바꾸지 않는다. "감추지 않는다" 원칙(`UnmappedWork` 주석)은 **강제
  노출**이 아니라 **기본 노출**이었음을 분명히 한다: 사용자가 명시적으로 차단한 것만 숨긴다.
- **차단 키 = 복사본 slug**(`<풀>/<슬롯>`, `scanWorkingCopies` 가 만든 식별자). 작업 가지 하나를
  정확히 가리킨다. 같은 브랜치를 다른 슬롯에 다시 파면 새 slug 라 새로 뜬다 — 받아들일 만하다.
- **부분 갱신 PUT** — `SettingsUpdateRequest.blockedCopies` 는 `optional`. 다른 설정
  (firstmateHome·watchRoots)를 건드리지 않고 목록만 갈아 끼운다. `[]` = 모두 해제. 경로가
  아니라 식별자라 경로 정규화는 하지 않는다.
- **적용 범위** — `unknown`(작업중인데 티켓 미상)과 `unreadable`(상태를 못 읽은 사본) 행에
  "숨기기" 버튼을 붙인다. 둘 다 복사본 slug 다. `unclaimed`(티켓 단위)은 이번엔 제외.

## Consumers

- `code/web/contract/src/index.ts` — `Settings.blockedCopies`, `SettingsUpdateRequest.blockedCopies`
- `code/web/core-io/src/settings-store.ts:65` — `DEFAULTS`, `writeSettings` merge
- `code/web/backend/src/app.ts:229` — `inProgressFor` read-time 필터
- `code/web/backend/src/app.ts:319` — PUT `/api/settings` 처리
- `code/web/frontend/src/lib/query.ts` — `useBlockedCopies`
- `code/web/frontend/src/components/features/FeaturesView.tsx` — 카드 "숨기기" 버튼
- `code/web/frontend/src/components/settings/SettingsDialog.tsx` — "차단한 작업 가지" 목록
