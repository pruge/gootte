# wayfinder — @gootte/time-ledger package 경계 제거

> **Architecture SoT:** [`fa5dea0`](https://github.com/earendil-works/gootte/commit/fa5dea04f8bb022151a69ca7374f8c088d8cebcd) — `docs(design): define shared time-ledger package boundary`
> **Plan status:** planning
> **Implementation:** 금지. 각 티켓 승인 후 순차 진행.

---

## 개요

`@gootte/cli`에 밀집된 시간 레코드 기능을 `@gootte/time-ledger`라는 독립 package로 분리하고, 소비자 전환을 단계적으로 수행한다. 5개 ticket으로 나누어 각 repo의 단일 authority가 작업한다.

## Ticket 그래프

| Ticket | Repo | Authority | 종속 | Scope |
|---|---|---|---|---|
| T01 | GoOtTe | w43:p1 | — | package + parity tests |
| T02 | GoOtTe | w43:p1 | T01 | CLI 전환 |
| T03 | GoOtTe | w43:p1 | T02 | dist/artifact + provenance |
| T04 | cross-repo handoff | w43:p1 | T02 | pi-taskflow contract + runbook |
| T05 | GoOtTe | w43:p1 | T03, T04 | terminal cleanup |

## 참조

- 설계 문서: `docs/features/time-ledger/design-note.md` (fa5dea0)
- 이전에 닫힌 acceptance: Commit D `4072b31` (HEAD fallback, end-to-end test)

## 주의사항

- **구현 금지.** planning만. 각 티켓 승인 후 별도 worker 스폰.
- T01-T03, T05는 GoOtTe repo에서만 동작.
- T04는 pi-taskflow source 편집 없이 handoff/runbook만 작성.
- T05는 T03(T04 포함) coordinated cutover 완료 후에만 실행 가능.
- attribution/push/release 없음.
