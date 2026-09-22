# wayfinder — @gootte/time-ledger package 경로 제거

> **Architecture SoT:** `fa5dea0` → follow-up `ff1c759` — `docs/features/time-ledger/design-note.md`
> **Plan status:** planning (revision 4)
> **Implementation:** 금지. 각 티켓 승인 후 순차 진행.

---

## 개요

`@gootte/cli`에 밀집된 시간 레코드 기능을 `@gootte/time-ledger`라는 독립 package로 분리하고, 소비자 전환을 단계적으로 수행한다. 6개 ticket + 2개 외부 milestone으로 나누어 각 repo의 단일 authority가 작업한다.

## 실제 consumer graph (codegraph + grep 실측)

### Prod writers (state mutation)
| Consumer | Path | Function | Sync/Async |
|---|---|---|---|
| CLI | `code/web/cli/src/time.ts` | `runTimeCommand` | sync → async (T02) |
| Backend route | `code/web/backend/src/routes/time.ts` | imports `runTimeCommand` from `@gootte/cli` | sync → async (T02) |
| CLI migrate | `code/web/cli/src/migrate-time.ts` | `readTicketRecords`, `writeTicketRecords`, `recalcProjectState` | sync → async (T02) |
| core-io state-store | `code/web/core-io/src/state-store.ts` | `upsertTicketRecord`, `recalcProjectState` | sync → async via adapter (T03) |

### Read-side consumers
| Consumer | Path | Function | Sync/Async |
|---|---|---|---|
| Backend route | `code/web/backend/src/routes/time.ts` | `readFeatures`, `joinTimeRecords` from `@gootte/core-io` | async (T03) |
| Backend app | `code/web/backend/src/app.ts` | `recalcProjectState` | async (T03) |
| core-io features | `code/web/core-io/src/features.ts` | `applyTimeRecords` from `@gootte/core` | async (T03) |

### Test consumers
| Consumer | Path |
|---|---|
| CLI tests | `code/web/cli/src/time.test.ts`, `code/web/cli/src/migrate-time.test.ts`, `code/web/cli/src/cli.test.ts` |
| core-io tests | `code/web/core-io/src/state-store.test.ts` |
| Backend tests | `code/web/backend/test/time-records-join.test.ts`, `code/web/backend/test/time-write-mode.test.ts` |
| core tests | `code/web/core/src/project/time-records.test.ts` |

### Frontend
- `@gootte/frontend`은 `allTickets`만 소비 (feature status 목록), time record CRUD 직접 소비 **없음** (codegraph+grep 확인).

## Ticket 그래프

| Ticket | Repo | Authority | 종속 | Capability |
|---|---|---|---|---|
| P01 | pi-taskflow | external | T05 | local adoption |
| C01 | external (Boss) | external | T04 | release approval + cutover receipt |
| T01 | GoOtTe | w43:p1 | — | package transitions + read API + lock |
| T02 | GoOtTe | w43:p1 | T01 | write adapters (CLI+migrate+backend async) |
| T03 | GoOtTe | w43:p1 | T02 | read-side migration + badge async |
| T04 | GoOtTe | w43:p1 | T03 | standalone artifact/provenance |
| T05 | GoOtTe | w43:p1 | T04 | cross-repo handoff/runbook |
| T06 | GoOtTe | w43:p1 | T03, P01, C01 | terminal legacy deletion (also removes writeBadgeV1/mutateState) |

## 주의사항

- **구현 금지.** planning만. 각 티켓 승인 후 별도 worker 스폰.
- T01-T06는 GoOtTe repo에서 동작. C01은 외부 milestone(Boss approval).
- T05는 pi-taskflow source 편집 없이 handoff/runbook만 작성.
- T06는 P01+C01 coordinated cutover 완료 후에만 실행 가능.
- attribution/push/release 없음.

## 참조

- 설계 문서: `docs/features/time-ledger/design-note.md` (follow-up `ff1c759`)
- 이전에 닫힌 acceptance: Commit D `4072b31` (HEAD fallback, end-to-end test)
