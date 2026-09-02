# 02 — 처리중은 Time 기록으로만 판정한다 (브랜치 관측 자동 처리중 폐기)

**Blocked by:** 없음 — 즉시 착수 가능

**Status:** resolved (2026-09-02)

## What to build

**처리중(`in_progress`) 판정의 근거를 바꾼다.** 지금은 **격리 사본 관측**이 만든다 —
작업 가지(`origin/main..HEAD` 커밋 또는 미커밋 변경)가 티켓 파일을 건드리면 그 티켓을
`in_progress` 로 만든다. 이것을 **`Time: started=` 기록이 있어야만** 처리중으로 바꾼다.

브랜치 관측은 여전히 **누가 붙들고 있나(`workedBy`)** 를 실어주는 데 쓴다 — 처리중의
**근거만 Time 으로** 옮기는 것이다. `gootte start`(Time 기록)로 시작을 밝힌 티켓만 처리중.

## Why — 실제 결함 (2026-09-02 캡틴 보고)

`studio-function-authoring-ux/tickets/T02.md`(캡틴 검수 티켓, `Time: started=` 없음)가
처리중으로 떴다. 원인은 `fsm-coordination-docs` worktree 의 커밋이 그 파일을 건드렸기 때문.
한 worktree 가 여러 티켓 파일을 건드리면 **전부** 처리중이 되어, "실제로 무엇을 작업하고
있는지" 파악이 불가능해진다(캡틴: *"브랜치라고 해서 전체를 시작으로 보면 곤란하다"*).

## 설계 결정

- **처리중 = `Time: started=` 가 있고 완료 기록(`finished=`)이 없는 티켓.**
- 브랜치 관측은 처리중을 **만들지 않는다.** `workedBy`(어느 가지가 붙들었나)만 실어준다.
- `unknown`(티켓 미상·작업중) — 관측이 티켓에 못 잇는 사본은 그대로 남는다(INV-4, 감추지 않음).
- `unreadable`·`unclaimed`·`working`·`copies` — 관측 기반 그대로 유지.
- 🔴 기존 결정을 뒤집는다 — [Q1=안B](adr/0001-in-progress-comes-from-observation.md)
  (*"커밋이 건드린 티켓 파일로만 잇는다"*) 를 폐기하고 이 결정을 새 ADR 로 기록한다.

## 완료 조건

- [ ] 작업 가지가 티켓 파일을 건드려도, `Time: started=` 가 없으면 처리중이 아니다
- [ ] `Time: started=` 가 있으면 처리중이고, `workedBy` 에 어느 가지인지 실린다
- [ ] done/dropped 는 그대로 유지 — 처리중으로 되돌아가지 않는다
- [ ] `unknown`(티켓 미상·작업중) 관측은 그대로 남는다
- [ ] `pnpm verify` green

## 테스트

| 무엇 | 어디 | 이 티켓이 처음인가 |
|---|---|---|
| 🔴 브랜치가 건드려도 Time 없으면 처리중 아님 | 단위(`core/in-progress.test.ts`) | 🔴 예 — 새 규칙 |
| 🔴 Time 있으면 처리중 + workedBy | 단위 | 🔴 예 |
| done/dropped 는 유지 | 단위 | 기존 — 그대로 통과해야 |
| unknown·unreadable·unclaimed 관측 유지 | 단위 | 기존 — 그대로 통과해야 |
