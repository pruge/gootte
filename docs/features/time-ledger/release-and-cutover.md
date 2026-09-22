# release-and-cutover — @gootte/time-ledger coordinated cutover runbook

> **Architecture SoT:** `fa5dea0` — `docs/features/time-ledger/design-note.md`
> **Planning only.** Runbook이 아닌 actual execution은 ticket 승인 후.

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
2. T02: CLI가 package API로 전환, old/new parity matrix green
3. T03: release-ready artifact (`.tgz` + exact semver + sha512) exists
4. T04: consumer contract + runbook exists

## Cutover Steps

```
Phase 1 — Quiescent
  1. 모든 writer 확인: GoOtTe CLI, pi-taskflow, 기타 consumer가 현재 write 중인지 확인
  2. lifecycle write 중지: 모든 consumer가 write를 중단하는지 확인
  3. 버전 pin 전환 준비: 새 version, integrity hash 확정

Phase 2 — Coordinated Switch
  4. pi-taskflow: artifact 다운로드 + integrity 검증 → package install
  5. GoOtTe CLI: 새 package로 전환 (global install 없이)
  6. parity/readback: 동일 input으로 old vs new output 비교
  7. 재개: lifecycle write 재개

Phase 3 — Verification
  8. zero-downtime verification: 모든 consumer가 새 package를 경유
  9. lock contention test: concurrent write가 CAS로 처리되는지
  10. rollback plan 확인
```

## Rollback (same quiescent procedure)

```
Phase 1 — Quiescent
  1. 모든 writer 확인
  2. lifecycle write 중지

Phase 2 — Coordinated Revert
  3. pi-taskflow: 이전 artifact로 rollback
  4. GoOtTe CLI: 이전 버전으로 복원
  5. parity/readback 확인

Phase 3 — Verification
  6. 모든 consumer가 이전 경로를 사용하는지 확인
```

## Key Rules

- **GoOtTe만 새 global 설치하지 않는다.** 혼합 runtime을 만들지 않는다.
- **pi-taskflow source 편집 금지.** p1F가 local adoption ticket으로 처리.
- **lock을 모르는 pi-taskflow writer가 공존할 수 있음**을 숨기지 않는다.
- **Boss release approval이 없으면 GitHub push/tag/release를 수행하지 않는다.**
- **exact semver + sha512 pin**, caret 금지.
- **state schema v2와 package semver를 혼동하지 않는다.**

## Stop Conditions

- Quiescent phase에서 writer가 중단되지 않으면 cutover를 중단.
- Parity/readback에서 차이가 발견하면 rollback.
- Lock contention test가 실패하면 rollback.

## T03 Artifact Coordinates (placeholder)

```
package: @gootte/time-ledger
version: 0.1.0
channel: GitHub Release standalone .tgz asset
integrity: <sha512-to-be-determined>
semver-range: exact 0.1.0 (caret prohibited)
```

## Notes

- 이 runbook은 T04의 handoff 결과이다. p1F가 자기 repo에서 local adoption ticket으로 옮길 때 이 runbook을 참조한다.
- 결정 복제가 아닌 `fa5dea0` + 이 runbook 참조.
- 각 단계를 manual file로 추적하되, 여기서는 exact condition만 명시.
