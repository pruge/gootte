---
name: gootte-ticket
description: gootte 저장소에서 티켓·spec 을 쓰거나 고칠 때, 그리고 작업의 시작·완료를 기록할 때. 티켓 서식(tickets/T<NN>.md), Blocked by 의미, Status 어휘, gootte start/end/pause/drop 사용법을 담는다. 티켓을 만들거나 닫거나 상태를 적으려 할 때 먼저 읽는다.
---

# gootte 티켓 — 서식과 완료 기록

🔴 **`Time:` 과 `Status:` 는 손으로 쓰지 않는다 — `gootte` 만 쓴다.** 이것 하나만 기억해도 절반이다.

🔴 **기록 위치(time-records-to-state-store, 2026-09-09)** — 이 저장소(v2)에서는 시간·상태 기록이
`<프로젝트>/.gootte/state.json` v2 의 `tickets` 맵에 들어간다. `gootte start/end` 는 **MD 줄을
건드리지 않고** 레코드를 쓴다. MD `Time:` 줄은 아직 남아 있어도 읽히지 않는다 — 손으로 고쳐도
화면이 바뀌지 않는다. 미이관 프로젝트는 예전대로 MD 줄이다.

## gootte CLI — 시작·완료를 기록한다

```
gootte start [--at <TIME>] [--update] <기능> <티켓>   # 그 티켓의 첫 편집 직전
gootte pause  [--at <TIME>] <기능> <티켓>              # 실제로 손을 뗄 때
gootte resume [--at <TIME>] <기능> <티켓>
gootte end    [--at <TIME>] <기능> <티켓>              # verify 가 green 이 된 뒤에만
gootte cancel <기능> <티켓>                            # 잘못 시작 — 레코드 삭제(MD 모드는 Time 줄 삭제)
gootte drop   [--at <TIME>] <기능> [<티켓>]            # 폐기 — 레코드 statusRaw wontfix(MD 모드는 Status: 줄)
gootte migrate-time [--dry-run] <프로젝트>             # MD 기록 → 레코드 이관(MD 줄은 삭제하지 않는다)
```

- `TIME` 은 비우면 지금. ISO8601 또는 상대시간(`90m` `1h30m` `2h` `1d`)이고 **과거로 해석**된다 —
  깜빡한 시작은 `gootte start --at 40m <기능> T03` 으로 소급한다.
- 티켓 인자는 `T03` · `3` · `03` 을 다 받는다.
- 🔴 **`end` 를 미리 부르지 마라.** `started=` 만 있는 것이 올바른 작업 중 상태다.
  verify green 을 **스스로 확인한 뒤에** 닫는다 — 확인 전에 찍으면 기록이 거짓이 된다.
- `gootte` 는 **커밋하지 않는다.** v2 프로젝트의 레코드(state.json)는 MD 커밋과 함께 관리한다.
- **작업 중인 사본 안에서 실행한다** — worktree 면 메인 프로젝트의 state.json 에 기록된다
  (`.gootte/config.json` 으로 메인을 찾고, 없으면 git 으로 추론해 생성한다).
- `end` 는 **옛 관례(`issues/`) MD 모드에서만** `Status:` 를 `resolved (날짜)` 로 갱신한다.
  v2 레코드·신관례 MD 모드는 완료를 `finished=` 에서 파생한다.

**주기:** `start` → 구현 + 테스트 → `pnpm verify` green 확인 → `end` → 보고.

## 티켓 서식 — `docs/features/<기능>/tickets/T<NN>.md`

제목은 `# T<NN> — <제목>`(em dash). **손으로 쓰는 머리글 줄은 `**Blocked by:**` 하나뿐이다.**
선행이 없으면 `**Blocked by:** 없음 — 즉시 착수 가능`.

본문 절: `## Goal` · `## Why this slice` · `## Produces` · `## Consumers` · `## Touched surfaces` ·
`## Explicitly out of scope` · `## Locked decisions` · `## Evidence anchors` · `## Regression guards` ·
`## Scope` · `## Implementation notes` · `## Acceptance criteria` · `## Verification` ·
`## Comments`(append-only).

🔴 **`task-planning` 스킬의 내장 티켓 템플릿은 Firstmate 공용 기본값이지 이 프로젝트 서식이 아니다** —
그것은 `Status:` 를 손으로 쓰고 `## Depends on` / `## Can run in parallel with` 를 더한다.
셋 다 빼고 위 서식으로 옮겨 적는다(의존은 `Blocked by:` 가 이미 갖는다). 이 실수가 세 번 재발했다.

## 자세한 것

- 레이아웃·두 관례·`Blocked by:` 의미·다음 할 일 계산: [`docs/agents/issue-tracker.md`](../../../docs/agents/issue-tracker.md)
- `Status:` 아홉 값과 어디에 걸리는지: [`docs/agents/triage-labels.md`](../../../docs/agents/triage-labels.md)
