# release-and-cutover — @gootte/time-ledger coordinated cutover runbook

> **Architecture SoT:** `fa5dea0` → follow-up `ff1c759` — `docs/features/time-ledger/design-note.md`
> **Planning only.** Actual execution is ticket-approved.

---

## Purpose

pi-taskflow가 `@gootte/time-ledger` standalone package를 소비하기 위한 **quiescent coordinated cutover** 절차. GoOtTe만 새 global 설치해 혼합 runtime을 만들지 않는다.

## Participants

- **GoOtTe** — package producer + CLI
- **pi-taskflow** — package consumer (source 편집 금지)
- **Boss** — release approval (T04 blocker)
- **p1F** — pi-taskflow local adoption ticket creator

## Pre-conditions

1. T01: `@gootte/time-ledger` package + read/derived API + parity tests green
2. T02: CLI/migrate/backend async ripple migrated, old/new parity matrix green
3. T03: read-side migration complete (core-io join/read, badge async adapter, backend app)
4. T04: release-ready `.tgz` artifact + sha512 evidence exists (generator: `code/web/time-ledger/scripts/pack-verify.mjs`)
5. T05: consumer contract + runbook exists
6. P01: pi-taskflow local adoption ticket created
7. C01: Boss-approved release + quiescent coordinated cutover receipt

## Cutover Steps (quiescent)

```
Phase 1 — Quiescent
  1. All writer confirmation: GoOtTe CLI, pi-taskflow, others idle
  2. Lifecycle write stop: all consumers paused from writing
  3. Version pin: new version, integrity hash confirmed
  4. GoOtTe CLI versioned bundle prepared (Boss-approved global install if needed for live writer)

Phase 2 — Coordinated Switch
  5. pi-taskflow: artifact download + integrity verification → package install
  6. GoOtTe CLI: versioned bundle switch
  7. Parity/readback: identical input, old vs new output comparison
  8. Lock contention test: concurrent write handled by CAS
  9. Resume: lifecycle write restart

Phase 3 — Verification
  10. Consumer inventory: all consumers use new package
  11. Rollback plan confirmed
```

**Lock contention / parity verification occurs BEFORE writer resume (Phase 2 → Phase 3 → resume). Not after.**

## Rollback (same quiescent procedure)

```
Phase 1 — Quiescent
  1. All writer confirmation
  2. Lifecycle write stop

Phase 2 — Coordinated Revert
  3. pi-taskflow: previous artifact rollback
  4. GoOtTe CLI: previous versioned bundle revert
  5. Parity/readback confirmation

Phase 3 — Verification
  6. All consumers use previous path
```

## Key Rules

- **GoOtTe only new global install prohibited.** Versioned GoOtTe CLI bundle required for live writer (Boss-approved).
- **pi-taskflow source 편집 금지.** p1F handles local adoption.
- **Migration window coexistence explicitly stated.** Lock-unaware pi-taskflow writer may exist during transition.
- **Boss release approval required** for GitHub push/tag/release.
- **Exact semver + sha512 pin**, caret prohibited.
- **State schema v2 ≠ package semver.** Not mixed.
- **'zero-downtime' is not claimed.** This is quiescent pause, not zero-downtime.
- **CLI thin delegate preserved.** `runTimeCommand`, `migrateTime` stay as package delegates (T06 does not delete them).

## Stop Conditions

- Quiescent phase fails (writer not paused) → stop cutover.
- Parity/readback mismatch → rollback.
- Lock contention test fails → rollback.

## Artifact Coordinates (T04-dependent, exact after T04)

```
package: @gootte/time-ledger
version: 0.1.0
channel: GitHub Release standalone .tgz asset
integrity: <sha512-from-T04-receipt>
semver-range: exact 0.1.0
generator: code/web/time-ledger/scripts/pack-verify.mjs
tarball: artifacts/time-ledger/gootte-time-ledger-0.1.0.tgz
receipt: docs/features/time-ledger/receipts/time-ledger-0.1.0.sha512
```

## Notes

- This runbook is T05 handoff output. p1F references it for local adoption ticket.
- Decision reference: `fa5dea0` + this runbook. Not copied.
- Each phase documented in exact manual steps per ticket.
