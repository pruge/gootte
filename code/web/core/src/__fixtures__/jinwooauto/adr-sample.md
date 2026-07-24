# ADR-0001: 코일 = 명령 `시작주소` 직행 (단자 = 데이터 흐름 밖 옵션 라벨)

Status: accepted
Date: 2026-07-01 / 관련: spec.md §A, gateway-runtime ADR-0002(supersede)

## Context
gateway-runtime thin-slice(landed)는 코일을 `Device.output.terminal → commandCoilForTerminal(전역 output-port-catalog) → commandCoil` 로 **단자에서 파생**한다. 사용자 설계 원칙(2026-07-01): **단자(terminal)는 옵션 라벨일 뿐 데이터/명령 흐름에 써서는 안 된다.** 명령 흐름 = `국번 + function + 시작주소(coil) + value`. 코일은 명령의 `시작주소`(admin 이 명령편집기에서 직접 입력 — `CommandEditorRow` write-single-coil 에 이미 노출)다.

## Decision
- **게이트웨이 코일 = 명령의 `payload.startAddress`** 직행. `DeviceCommandInterpreter.resolve` 가 role 로 고른 `Command` 의 `payload.startAddress` 를 FramePlan 코일로 사용(was: entry.commandCoil).
- **`CatalogDeviceEntry` 에서 `commandCoil` 제거** — entry = `{deviceId, slaveAddress, commands[]}`. commands 가 이미 `payload.startAddress`/`value` 운반.
- **backend `selectCatalogSnapshotForGateway`**: `commandCoilForTerminal` 호출·terminal null skip 제거. output-control device 면 `{deviceId, slaveAddress, commands}` 그대로 push.
- **단자(`DeviceOutputBinding.terminal`)는 그대로 두되 흐름에서 미사용** — 옵션 라벨로 강등. 라벨맵 작성 UI 는 후속 C(`controller-terminal-label-map`).
- admin 변경 0 (시작주소 이미 입력 가능). 전역 `output-port-catalog`/`commandCoilForTerminal` 의 device-resolution 용도 폐기(owner-outputs 고스트 경로는 별개 — 미변경).

## Alternatives
- **단자→컨트롤러 단자맵 코일 파생**(이전 안) — 거부: 사용자가 "단자=흐름 밖" 명시. 코일은 명령 데이터.
- **commandCoil 유지(vestigial)** — 거부: 죽은 필드가 혼동. 명령 startAddress 가 SoT 이므로 entry 코일 제거.

## Consequences
- (+) 단자 없이 어떤 컨트롤러(IL 960 / 485 relay 직접)든 admin 이 시작주소로 표현 → 전역 catalog HW 가정 탈피.
- (+) 명령 startAddress = 단일 코일 SoT, instance 별(명령셋 스냅샷에 포함).
- (−) landed `CatalogDeviceEntry.commandCoil` 제거 = contract 변경(codegen) + 게이트웨이 interpreter/테스트 수정. 단 같은 sprint 내라 drift 없음.
- (−) terminal=null device 도 이제 snapshot 포함(코일은 startAddress) → 명령에 startAddress 없으면 게이트웨이가 skip/로그(방어).

## Invariant impact
- **INV-4** — 게이트웨이가 명령 startAddress 로 코일 결정(PLC dumb). 준수.
- **INV-7** — raw 코일은 admin 명령편집기 입력(통합자 권한, 기존 패턴) + 게이트웨이 내부. owner/operator 엔 deviceId+verb 만 노출(코일 영영 안 보임). 준수.
- **INV-5** — `CatalogDeviceEntry` 변경 → codegen 재실행·drift-guard.

## Contract impact
`CatalogDeviceEntry` 에서 `commandCoil: zInt()` 제거(`code/web/contract/src/wss/gateway.ts`). codegen → Kotlin `CatalogDeviceEntry` 동기. drift-guard green 필수.
