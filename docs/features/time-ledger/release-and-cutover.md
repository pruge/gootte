# release-and-cutover — @gootte/time-ledger coordinated cutover runbook

> **Architecture SoT:** `fa5dea0` — `docs/features/time-ledger/design-note.md`
> **Planning only.** Actual execution is ticket-approved.

---

## Purpose

pi-taskflow가 `@gootte/time-ledger` standalone package를 소비하기 위한 **quiescent coordinated cutover** 절차. GoOtTe만 새 global 설치해 혼합 runtime을 만들지 않는다.

## Participants

- **GoOtTe** — package producer + CLI
- **pi-taskflow** — package consumer (source 편집 금지)
- **Boss** — release approval (T03 blocker)
- **p1F** — pi-taskflow local adoption ticket creator

## Pre-conditions

1. T01: `@gootte/time-ledger` package + parity tests green
2. T02: CLI/migrate/backend adapters migrated, old/new parity matrix green
3. T03: release-ready `.tgz` artifact + sha512 evidence exists
4. T04: consumer contract + runbook exists
5. P01: pi-taskflow local adoption ticket created
6. C01: Boss-approved release + quiescent coordinated cutover receipt

## Cutover Steps (quiescent)

```
Phase 1 — Quiescent
  1. All writer confirmation: GoOtTe CLI, pi-taskflow, others idle
  2. Lifecycle write stop: all consumers pause writing
  3. Version pin: new version, integrity hash confirmed

Phase 2 — Coordinated Switch
  4. pi-taskflow: artifact download + integrity verification → package install
  5. GoOtTe CLI: versioned bundle switch (Boss-approved global install if needed for live writer)
  6. Parity/readback: identical input, old vs new output comparison
  7. Resume: lifecycle write restart

Phase 3 — Verification
  8. Consumer inventory: all consumers use new package
  9. Lock contention test: concurrent write handled by CAS
  10. Rollback plan confirmed
```

## Lock contention / parity verification

Lock contention test and parity/readback verification occur **BEFORE** writer resume (Phase 2 → Phase 3 → resume). Not after.

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

- **GoOtTe only new global install prohibited.** Versioned GoOtTe CLI bundle required for live writer.
- **pi-taskflow source 편집 금지.** p1F handles local adoption.
- **Migration window coexistence explicitly stated.** Lock-unaware pi-taskflow writer may exist during transition.
- **Boss release approval required** for GitHub push/tag/release.
- **Exact semver + sha512 pin**, caret prohibited.
- **State schema v2 ≠ package semver.** Not mixed.
- **'zero-downtime' is not claimed.** This is quiescent pause, not zero-downtime.

## Stop Conditions

- Quiescent phase fails (writer not paused) → stop cutover.
- Parity/readback mismatch → rollback.
- Lock contention test fails → rollback.

## Artifact Coordinates (T03-dependent, exact after T03)

```
package: @gootte/time-ledger
version: 0.1.0
channel: GitHub Release standalone .tgz asset
integrity: <sha512-to-be-filled-after-T03-release>
semver-range: exact 0.1.0
```

## Notes

- This runbook is T04 handoff output. p1F references it for local adoption ticket.
- Decision reference: `fa5dea0` + this runbook. Not copied.
- Each phase documented in exact manual steps per ticket.
