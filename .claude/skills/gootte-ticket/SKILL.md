---
name: gootte-ticket
description: gootte 저장소에서 티켓·spec 을 쓰거나 고칠 때, 그리고 작업의 시작·완료를 기록할 때. 티켓 서식(tickets/T<NN>.md), Blocked by 의미, Status 어휘, gootte start/end/pause/drop 사용법을 담는다. 티켓을 만들거나 닫거나 상태를 적으려 할 때 먼저 읽는다.
---

# gootte 티켓 — 서식과 완료 기록

🔴 **`Time:` 과 `Status:` 는 손으로 쓰지 않는다 — `gootte` 만 쓴다.** 이것 하나만 기억해도 절반이다.

## gootte CLI — 시작·완료를 기록한다

```
gootte start [--at <TIME>] [--update] <기능> <티켓>   # 그 티켓의 첫 편집 직전
gootte pause  [--at <TIME>] <기능> <티켓>              # 실제로 손을 뗄 때
gootte resume [--at <TIME>] <기능> <티켓>
gootte end    [--at <TIME>] <기능> <티켓>              # verify 가 green 이 된 뒤에만
gootte cancel <기능> <티켓>                            # 잘못 시작 — Time 줄 삭제
gootte drop   [--at <TIME>] <기능> [<티켓>]            # 폐기 — Status: wontfix (날짜)
```

- `TIME` 은 비우면 지금. ISO8601 또는 상대시간(`90m` `1h30m` `2h` `1d`)이고 **과거로 해석**된다 —
  깜빡한 시작은 `gootte start --at 40m <기능> T03` 으로 소급한다.
- 티켓 인자는 `T03` · `3` · `03` 을 다 받는다.
- `start` 를 이미 시작된 티켓에 부르면 물어본다. `--update` 로 묻지 않고 갱신.
- 🔴 **`end` 를 미리 부르지 마라.** `started=` 만 있는 것이 올바른 작업 중 상태다.
  verify green 을 **스스로 확인한 뒤에** 닫는다 — 확인 전에 찍으면 기록이 거짓이 된다.
- `gootte` 는 **커밋하지 않는다.** `Time:` 변경은 그 티켓 자신의 커밋에 같이 실린다.
- **작업 중인 사본 안에서 실행한다** — cwd 의 git 루트를 기준으로 대상을 찾는다.
- `end` 는 **옛 관례(`issues/`)만** `Status:` 를 `resolved (날짜)` 로 함께 갱신한다.
  신관례(`tickets/`)는 완료를 `Time:` 의 `finished=` 에서 파생한다.

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
