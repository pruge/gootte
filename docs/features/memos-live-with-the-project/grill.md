# grill — memos-live-with-the-project (메모를 프로젝트 안으로)

요청(캡틴 2026-09-14): "각 프로젝트는 github 에서 관리. 메모만 중앙관리되어서야. 다른 곳에서는 메모를
볼 수가 없다. 메모는 `.gootte` 밑에 개별적으로 `memo.json` 으로 존재해야. 그래야 다른 곳에서도 경험을
유지하지." + "개발이 되면 이관도 같이 진행."

## 라운드 1 — 프론티어 (답 확보)

| # | 결정 | 답 |
|---|---|---|
| 1 | git 추적 정책 | **`memo.json` 은 추적된다**(그래야경험이 이동한다). 각 프로젝트 `.gitignore` 의 예외 한 줄은 **그 프로젝트의 표**로 남긴다(gootte 가 남의 저장소 파일을 고치지 않는다 — INV-2) |
| 2 | 어느 사본에 쓰나 | **메인 사본**의 `.gootte/memo.json`(시간 기록과 같은 규칙) |
| 3 | 이관 | 개발과 **같은 왕복에** 진행 |

## Facts (코드에서 확인한 것)

- 지금 자리: `GOOTTE_DATA_DIR/memos/<slug>.json` = `~/.gootte/memos/jinwooauto.json` (`memo-store.ts:16` `memosFile`, `:25` `readMemos`).
  **중앙이라 클론 간에 안 이동한다** — 캡틴이 지적한 그대로.
- 같은 `~/.gootte` 에는 `plan.db`·`settings.json` 도 있고, 오늘 **작업 사본의 `db migrate` 가 그 중앙을
  그대로 망가뜨린 실사례**가 있다(단계 18행 소실). 즉 `memos/` 도 같은 무격리 사고의 다음 차례다.
- **선례가 이미 존재한다**: 시간·상태 기록은 `<프로젝트>/.gootte/state.json` v2 에 산다(캡틴 승인
  2026-09-09, INV-1 예외 — "산출물은 이미 `.gootte/` 네임스페이스 안"). `jinwooauto/.gootte/state.json`
  이 실제로 그 자리에 있다. → 메모의 이 착지는 **새 예외가 아니라 같은 예외의 확장**이다.
- 원장(메인 사본 해석) 규칙은 이미 있다: worktree(cwd) → `.git` 이 **파일(gitdir:)이면 메인으로는승격**,
  **디렉토리면 그 자체가 메인** (`pi-ticketflow/src/tracker/gootte.ts:43`, gootte 도 같은 `.gootte/config.json` 규약).
- 백엔드는 slug → 사본 목록 + 대표 경로를 이미 해소한다 (`backend/src/routes/memo.ts:22-30` deps 의
  `resolveSlug`·`effectiveRoots`·`dataDir`, 해소는 `discover-cache.ts`). 즉 **경로를 바꿔도 라우트의
  좌표 해석은 그대로** 쓰고, 저장 자리(`dataDir` → 메인 프로젝트 경로)만 바뀐다.
- `Memo` 스키마(id/content/done/createdAt/updatedAt) 와 `MemosResponse` 는 그대로 둔다 — contract
  변경 없음. `id` 규약(`<epochMs>-<counter>`) 은 **프로젝트 단위**라 파일이 옮겨도 충돌하지 않는다.
- 이관 대상 실측: `jinwooauto` 23건(완료 8 · 다중 줄 2) · 그 외 중앙 파일 없음.

## INV 점검

- **INV-2(관리대상 읽기 전용)**: 이건 관리대상 **문서**(`docs/features/` spec·티켓) 를 쓰는 일이 아니다.
  시간 기록과 같은 `.gootte/` 네임스페이스에 gootte 자기 산출물을 쓰는 것으로, 이미 승인된 예외
  계보(`time-records-to-state-store`)에 잇는다. 예외의 확장이므로 `AGENTS.md` 의 불변식 칸에 한 줄을
  더하고 ADR 로 남긴다 — 조용히 넘기지 않는다.
- **INV-5**: 메모는 사람이 정한 값이라 저장 자격이 있다. 위치가 바뀌어도 저장의 성격은 그대로.
- **INV-1·INV-3**: 중앙 복사본·캐시를 두지 않는다 — 한 자리에 쓰고 거기서 읽는다(이중 원장이 생기면
  이번 왕복이 없애려던 통증이 그대로 돌아온다).
- **INV-4**: 읽기 경로에 요약을 넣지 않는다 — 이관 시 내용 bytes 그대로.

## Locked decisions

1. 파일: `<메인 프로젝트>/.gootte/memo.json`, 내용은 지금과 같은 `Memo[]` 배열 하나(래퍼 객체 없음).
2. API 는 `memosFile(dataDir, slug)` 계층을 **`memosFile(projectDir)`** 로 바꾼다(호출 측이 프로젝트 경로를
   해소해 넘긴다). `readMemos/appendMemo/updateMemo/deleteMemo` 는 서명에서 slug 대신 projectDir 를 받는다.
3. 이관은 **별도 명령**(`gootte memo migrate [slug]`), 기본은 **원본 유지** — 쓴 것을 지우는 건
   되돌릴 수 없으니 `--purge` 를 캡틴이 명시할 때만 중앙 파일을 없앤다(불가역 경계).
4. 원본이 남아 있는 동안 다시 migrate 하면: 대상 파일과 **같은 내용이면 skip**, 다르면 **오류로 멈춘다**
   (조용한 덮어쓰기 금지 — 어느 쪽이 최신인지 사람이 정한다).
5. 화면·백엔드·CLI 는 모두 같은 새 자리에서 읽고 쓴다. 폴백(central 을 계속 읽기) 은 **두지 않는다** —
   폴백이 있는 순간 이중 원장이 되고, 이관 안 된 프로젝트가 이관된 척 보인다.
6. 🔴 **그래서 순서가 강제가 된다**: 읽기 경로를 바꾸기 **전에** 이관이 끝나 있어야 한다. 안 그러면
   경로를 돌린 그 순간 jinwooauto 의 23건이 화면에서 "메모 없음" 으로 사라진다(이중 원장을 막자고
   데이터를 잃는 셈이 된다). 표 순서가 그 규칙이다 — T01 이관 → T02 경로 전환.
7. `memo` CLI 의 출력은 이관 전후로 안 바뀐다(같은 계산 함수를 읽기만 함). 헤더 `== <slug> · 메모 없음 ==`
   규약도 그대로.
