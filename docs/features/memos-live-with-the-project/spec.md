# memos-live-with-the-project — 메모를 프로젝트와 함께 이동하게 만든다

## 배경

`memos-read-from-any-session`(T01 머지됨) 으로 CLI 는 생겼지만, 메모는 여전히 **중앙**
`~/.gootte/memos/<slug>.json` 에 산다. 캡틴 지적: 프로젝트는 github 에서 관리되는데 메모만 중앙에
있으면 **클론·기계 간에 경험이 안 따라간다**. 그리고 중앙 `~/.gootte` 는 오늘 이미 사고를 낸 자리다
— 작업 사본이 `db migrate` 를 무격리로 돌려 같은 집의 `plan.db` 단계 18행을 날렸다. `memos/` 도
그 다음 차례였다.

## 문제

1. 메모가 저장소에서 안 이동한다 → 다른 사본·다른 기계의 세션이 같은 생각을 못 본다.
2. 메모가 다른 사람의 원장과 한 곳에 섞여 있다 → 작업 사본 하나가 캡틴의 중앙 저장소에 닿는다.

## Goal

메모를 **`<메인 프로젝트>/.gootte/memo.json`** 으로 옮긴다. 이관과 경로 전환을 한 기능으로 끝낸다.
- T01 — `gootte memo migrate [slug] [--purge]` (읽는 쪽은 아직 중앙, 쓰는 곳은 프로젝트)
- T02 — 읽기·쓰기를 프로젝트 파일로 전환(폴백 없음)
- T03 — 종단 확인(캡틴)

## 설계 결정 (grill.md 에 답과 순서가 잠겨 있다)

- **한 자리**: `<main project>/.gootte/memo.json`, 내용은 지금과 같은 `Memo[]` 배열(래퍼 객체 없음).
  스키마·`Memo` contract 는 그대로 — `id` 규약이 원래 프로젝트 단위라 파일이 옮겨도 안 겹친다.
- **선례에 잇는다**: 시간·상태 기록이 같은 네임스페이스(`<프로젝트>/.gootte/state.json`)에 사는
  예외는 이미 캡틴 승인(2026-09-09)으로 존재한다. INV-2(관리대상 읽기 전용)는 **문서**에 대한 것이고
  `.gootte/` 는 gootte 자기 산출물 자리다. 예외를 확장하는 일이라 조용히 넘기지 않고 `AGENTS.md`
  불변식 칸에 한 줄과 ADR 로 남긴다.
- **메인 사본 규칙**: worktree(cwd) 는 `.git` 이 파일이면 메인으로 승격, 디렉토리면 자기 자신
  (시간 기록과 같은 판). 화면·백엔드·CLI·이관 명령이 전부 같은 해석을 쓴다.
- **폴백 금지**: 경로 전환 뒤에도 central 을 읽으면 이중 원장이 된다. 그래서 **순서가 강제**된다 —
  이관(T01) 없이 읽기를 돌리면 jinwooauto 23건이 "메모 없음" 으로 보이는 손실이 발생한다.
- **이관은 원본 유지가 기본**: `migrate` 는 central 을 읽고 프로젝트에 쓴다. 지우는 일(`--purge`)은
  명시할 때만 — 되돌릴 수 없는 쪽은 사람의 손으로 남긴다.
- **재실행 안전**: 이미 이관된 대상이 있으면 같으면 skip, 다르면 오류(조용한 덮어쓰기 금지).
- **추적은 그 프로젝트의 일**: `jinwooauto` 는 `.gitignore` 에 `.gootte/` 를 무시로 걸어뒀다.
  `memo.json` 을 추적시키려면 그 저장소에 예외 한 줄이 필요하다 — **gootte 가 남의 프로젝트를
  고치지 않는다**(INV-2). 그 한 줄은 jinwooauto 쪽 표로 남기고, 이 기능은 그 파일이 추적되든 안
  되든 자기 동작만 옳게 한다.

## Produces

- `code/web/core-io/src/memo-store.ts` — `memosFile(projectDir)`, `readMemos(projectDir)` 등 서명이
  `(dataDir, slug)` → `(projectDir)` 로 간다. 쓰기 위치 규칙 한 곳.
- `code/web/core-io/src/memo-migrate.ts` — 순수 이관 판정(읽을 원본 → 쓸 대상 → skip/오류 분기).
- `code/web/backend/src/routes/memo.ts` · `app.ts` — 프로젝트를 대표 경로(메인) 로 해소해 넘긴다.
- `code/web/cli/src/commands.ts` · `main.ts` — `memo` 는 프로젝트 파일에서 읽고, `memo migrate` 신설.
- `bin/gootte` — `memo` 라우트는 이미 있고, `memo migrate` 가 그 안을 지나가도록 확인(인자 통과).
- `AGENTS.md` — 불변식 칸에 `.gootte/memo.json` 예외 한 줄 + `ADR`.
- 테스트: 위 각각 + `scripts/tests/`.

## Consumers

- 화면 `memo` 탭(읽기·쓰기) · `gootte memo` CLI · **각 프로젝트의 클론**(경험이 git 으로 이동한다).

## Explicitly out of scope

- 다른 프로젝트 `.gitignore` 수정(jinwooauto 의 표로 남긴다).
- `plan.db`·`settings.json` 을 프로젝트 안으로 옮기는 일(같은 병이지만 이 표가 먼저 이관 절차를 세워야
  한다 — 다음 표. **무격리 사고는 여기서 멈춘다**).
- 메모 검색·태그 등 기능 확장.

## Verification

`pnpm verify` green. 종단 확인은 T03(캡틴): jinwooauto 실제 이관 후 `gootte memo` 와 화면 `memo` 탭이
같은 23건을 같은 내용으로 보이는가.

## 불변식 점검

INV-1(한 자리에서 읽고 쓴다 — 캐시 없음) · INV-2(문서는 여전히 읽기만, `.gootte/` 는 자기 산출물 자리) ·
INV-3(전환 후 central 을 읽지 않는다) · INV-4(내용 bytes 그대로, 요약 없음) · INV-5(사람이 정한 값은
사람의 저장소로).
