# Specification — a-vanished-card-breaks-nothing

Status: ready-for-agent (2026-08-26)

## 캡틴 지시 (원문)

> gootte에서 이제 steps에 ticket이 올라오니 다음을 진행하자. … 그렇게 하자.
(전제: 2026-08-26 캡틴이 실제로 겪은 계획판 전체 오류를 고친다.)

## 문제

작업 대상 자리 행(`plan.db` placements)이 가리키는 기능의 **기획 문서가 디스크에서 사라지면**
계획판이 통째로 죽는다. 화면은 "Cannot read properties of undefined (reading 'tickets')" 만 보여준다.

## 실측 (2026-08-26, 재현 완료)

재현 조건: active 배치 행 `steps-start-from-dependencies` + 해당 기능 문서 부재.

    GET /api/plan/gootte → HTTP 500
    {"error":"Cannot read properties of undefined (reading 'tickets')"}

스택(실물 실행):

    at allTickets            core/src/project/features.ts:224   ← f.tickets 접근, f === undefined
    at indexActiveSteps      core/src/plan/step.ts:29           ← allTickets(featureOf.get(slug)!)
    at computeDisplaySteps   core/src/plan/step.ts:70

원인: `indexActiveSteps` 가 배치 행의 slug 로 기능을 찾을 때 비-널 단언(`!`)을 쓴다.
문서가 없어 파싱 결과에 없는 slug 면 `undefined` 가 그대로 들어간다.

## 결정

- 🔴 판 전체가 죽는 것은 안 된다. 문서 없는 카드는 **조용히 걸러진다** — 단계 계산과 `next` 에서
  빠질 뿐, 다른 카드와 나머지 판은 그대로 산다(INV-U1 과 같은 방향: 거짓 에러보다 조용한 누락).
- 🔴 배치 행 자체는 지우지 않는다 — 캡틴이 정한 자리다(INV-B 계열). 문서가 돌아오면 카드도 돌아온다.
- 🔴 판정 자리를 새로 만들지 않는다 — 여전히 `computeDisplaySteps` 하나다.

## 범위 밖

- 문서 부재의 원인 추적·복구(갱신 경로 문제 등) — 별건이다.
- 옛 관례(`issues/`) 티켓 경로 판별 — 이번엔 무관하다.

## 검증

`pnpm -C code/web verify` green (tsc --noEmit + vitest).
