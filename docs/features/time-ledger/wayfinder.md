# wayfinder — @gootte/time-ledger package 경계 제거

> **Architecture SoT:** `fa5dea0` — `docs/features/time-ledger/design-note.md`
> **Plan status:** planning (revision 3)
> **Implementation:** 금지. 각 티켓 승인 후 순차 진행.

---

## 개요

`@gootte/cli`에 밀집된 시간 레코드 기능을 `@gootte/time-ledger`라는 독립 package로 분리하고, 소비자 전환을 단계적으로 수행한다. 6개 ticket + 2개 외부 milestone으로 나누어 각 repo의 단일 authority가 작업한다.

## 실제 consumer graph (codegraph + grep 실측)

### Prod writers (state mutation)
| Consumer | Path | Function |
|---|---|---|
| CLI | `code/web/cli/src/time.ts` | `runTimeCommand` |
| Backend route | `code/web/backend/src/routes/time.ts` | imports `runTimeCommand` from `@gootte/cli` (thin facade) |
| CLI migrate | `code/web/cli/src/migrate-time.ts` | `readTicketRecords`, `writeTicketRecords`, `recalcProjectState` |
| core-io state-store | `code/web/core-io/src/state-store.ts` | `readTicketRecords`, `upsertTicketRecord`, `removeTicketRecord`, `recalcProjectState` |

### Read-side consumers
| Consumer | Path | Function |
|---|---|---|
| Backend route | `code/web/backend/src/routes/time.ts` | `readFeatures`, `joinTimeRecords` from `@gootte/core-io` |
| Backend app | `code/web/backend/src/app.ts` | `recalcProjectState` from `@gootte/core-io` |
| core-io features | `code/web/core-io/src/features.ts` | `applyTimeRecords` from `@gootte/core` |
| core-io state-store | `code/web/core-io/src/state-store.ts` | `readState`, `hasTimeRecords`, `clearState` |

### Test consumers
| Consumer | Path |
|---|---|
| CLI tests | `code/web/cli/src/time.test.ts`, `code/web/cli/src/migrate-time.test.ts`, `code/web/cli/src/cli.test.ts` |
| core-io tests | `code/web/core-io/src/state-store.test.ts` |
| Backend tests | `code/web/backend/test/time-records-join.test.ts`, `code/web/backend/test/time-write-mode.test.ts` |
| core tests | `code/web/core/src/project/time-records.test.ts` |

### Frontend
- `@gootte/frontend`은 `allTickets`만 소비 (feature status 목록), time record CRUD 직접 소비 **없음** (codegraph+grep 확인).

### Badge adapter
- Badge recompute stays in **`@gootte/core-io` adapter** (NOT in `@gootte/time-ledger`).
- `recalcProjectState` is called by CLI/migrate/backend after mutations.

## Ticket 그래프

| Ticket | Repo | Authority | 종속 | Capability |
|---|---|---|---|---|
| P01 | pi-taskflow | external | T05 | local adoption |
| C01 | external (Boss) | external | T04 | release approval + cutover receipt |
| T01 | GoOtTe | w43:p1 | — | package transitions + lock + importLegacy |
| T02 | GoOtTe | w43:p1 | T01 | GoOtTe write adapters (CLI+migrate) |
| T03 | GoOtTe | w43:p1 | T02 | read-side migration (core-io join/read, badge adapter, backend app) |
| T04 | GoOtTe | w43:p1 | T03 | standalone artifact/provenance |
| T05 | GoOtTe | w43:p1 | T04 | cross-repo handoff/runbook |
| T06 | GoOtTe | w43:p1 | T03, P01, C01 | terminal legacy deletion |

## 주의사항

- **구현 금지.** planning만. 각 티켓 승인 후 별도 worker 스폰.
- T01-T06, C01은 GoOtTe repo에서만 동작.
- T05는 pi-taskflow source 편집 없이 handoff/runbook만 작성.
- T06는 P01+C01 coordinated cutover 완료 후에만 실행 가능.
- attribution/push/release 없음.

## 참조

- 설계 문서: `docs/features/time-ledger/design-note.md` (fa5dea0)
- 이전에 닫힌 acceptance: Commit D `4072b31` (HEAD fallback, end-to-end test)
