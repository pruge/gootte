# @gootte/time-ledger — 공용 package 경계 제안서

> **목적:** 중복 구현 제거를 위해 시간 레코드 관련 논리를 `@gootte/cli`에서 분리, `@gootte/time-ledger`라는 독립 package로 통합.
> **승인 대기 중 — Captain(w43:p1) 승인 후 구현.**
> **Commit D 완료 후 revised note. 구현 금지.**
> **Follow-up decisions 2026-09-22: read/derived API, async ripple, artifact generator, T06 boundary.**

---

## 1. 현재 문제점

시간 레코드 기능이 `@gootte/cli/src/time.ts`에 밀집되어 있고, `@gootte/core-io/src/state-store.ts`의 state-store 함수들과 분리되어 있다. 중복과 결함:

1. `runTimeCommand`이 `ledgerRoot`과 `ticketSourceRoot`를 명시 분리하지 않아 feature-only ticket이 실패
2. 상태 잠금(CAS) 부재 — read-modify-write가 동시성에 취약
3. badge 재계산이 기록과 묶여 있어 `@gootte/core-io`/CLI가 같은 로직을 두 번 실행
4. pi-taskflow가 source path를 직접 참조 — package 재배포 시 깨짐
5. `@gootte/core`의 `timeRecordKey`/`applyTimeRecords`도 최종 중복 제거 대상

---

## 2. 제안 package: `@gootte/time-ledger`

### 2.1 위치 및 의존성

```
code/web/time-ledger/
├── package.json          # @gootte/time-ledger, semver 0.1.0
└── src/
    ├── index.ts          # Public API re-export
    ├── ledger.ts         # Transition API + read/derived API
    ├── types.ts          # Ledger-specific types, TicketRef, ResolvedTicketKey
    ├── lock.ts           # file hash/CAS + cross-process lock
    ├── core.ts           # Pure timeRecordKey + applyTimeRecords (replaces @gootte/core dependency)
    └── test/
        ├── ledger.test.ts
        ├── lock.test.ts
        ├── transition.test.ts
        └── read.test.ts
```

**의존성:**
- `@gootte/contract` (TicketTimeRecord, ProjectStateV2 types)
- **의존하지 않음:** `@gootte/core`, `@gootte/core-io`, `@gootte/cli`
- Pure `timeRecordKey`, `applyTimeRecords`는 time-ledger가 소유. `@gootte/core`에서 복제 후 T06에서 core versions 삭제.

### 2.2 상태 유지 (state.json v2)

**초기 extraction은 `.gootte/state.json` v2와 `TicketTimeRecord` shape를 그대로 유지한다.**

- record별 `version`/`provenance` 필드 **추가 금지** (라이브 migration·기존 zod 파손 방지)
- package provenance는 `package.json` semver + CLI `--version`이 담당
- writer audit은 별도 미래 event log이지 ticket record가 아님
- package 초기 semver: `0.1.0`

### 2.3 API: Transition + Read + Derived

**package가 소유하는 전체 public API:**

```typescript
// --- Transition API (generic CRUD 금지) ---

start(ref: TicketRef, at: string, options?: { update?: boolean }): Promise<LedgerResult | LedgerConflict>
pause(ref: TicketRef, at: string): Promise<LedgerResult | LedgerConflict>
resume(ref: TicketRef, at: string): Promise<LedgerResult | LedgerConflict>
end(ref: TicketRef, at: string): Promise<LedgerResult | LedgerConflict>
cancel(ref: TicketRef): Promise<LedgerResult | LedgerConflict>
drop(ref: TicketRef, at: string): Promise<LedgerResult | LedgerConflict>
reopen(ref: TicketRef, at: string): Promise<LedgerResult | LedgerConflict>
batchDrop(feature: string, keys: ResolvedTicketKey[], at: string): Promise<LedgerResult | LedgerConflict>
importLegacy(records: Record<string, Partial<TicketTimeRecord>>, options: { mode: 'overwrite' | 'append' }): Promise<LedgerResult<ImportSummary> | LedgerConflict>

// --- Read API ---

resolve(ref: TicketRef): Promise<LedgerResult<ResolvedTicketKey> | LedgerConflict>
read(ref: TicketRef): Promise<LedgerResult<TimedTicketRecord | undefined> | LedgerConflict>
readAll(): Promise<LedgerResult<Record<string, TimedTicketRecord>> | LedgerConflict>
hasTimeRecords(ledgerRoot: string): Promise<LedgerResult<boolean> | LedgerConflict>

// --- Derived cache transition (narrow, not generic CRUD) ---

replaceOpenFeatures(features: Feature[]): Promise<LedgerResult | LedgerConflict>

// --- Pure functions (formerly @gootte/core) ---

timeRecordKey(feature: string, ticket: string): string
applyTimeRecords(features: readonly Feature[], records: Readonly<Record<string, TicketTimeRecord>>): Feature[]
```

**importLegacy result type:** `Promise<LedgerResult<ImportSummary> | LedgerConflict>` — single coherent result. `LedgerConflict[]` union 금지.

**Badge 계산은 외부(core-io adapter)지만 state write lock은 하나:** `replaceOpenFeatures(features)` narrow derived-cache transition을 package가 제공. core-io adapter는 계산만 하고 이 API로 기록. generic CRUD는 계속 금지.

### 2.4 Canonical Semantics

| Operation | 허용 조건 | 거부 조건 |
|---|---|---|
| `start(ref, at)` | 미시작 | active 또는 finished 상태 |
| `start(ref, at, {update:true})` | active + pauses.length==0 + not dropped | finished, reopened, has pauses, dropped |
| `pause(ref, at)` | active + open pause 없음 | 미시작, 끝남, 이미 pause 중 |
| `resume(ref, at)` | open pause 존재 | active 아님, open pause 없음 |
| `end(ref, at)` | active + 모든 pause resumed | 미시작, pause 중, 이미 끝남 |
| `cancel(ref)` | record 존재, startedAt!=null, finishedAt==null, pauses.length==0, not wontfix | 그 외 모든 경우 |
| `drop(ref, at)` | 어떤 상태든 가능 | — (시작·완료 기록 보존, status만 변경) |
| `reopen(ref, at)` | ended + not dropped | active, 미시작, dropped |
| `importLegacy` | mode 'overwrite': active 없음. mode 'append': startedAt==null인 record만 overwrite | active record가 있는데 overwrite 시도, append mode에서 startedAt!=null record overwrite 시도 |

### 2.5 CAS: 파일 document hash/revision 단위

**key nonce가 아닌 file document hash/revision 단위 CAS.**

**Default parameters:**
- lock deadline: **2000ms**
- bounded retry: **10→100ms jittered**, deadline 기준
- stale reclaim: same-host lock age **≥30s** **그리고** owner PID 부재일 때만
- document hash mismatch: **최대 3회 재시도** 후 explicit conflict
- unique temp + fsync + rename + possible directory fsync + readback
- config override 가능하지만 above가 default

### 2.6 ledgerRoot/ticketSourceRoot — 내부 검증

**`LedgerConfig.gitVerified` 필드 제거.** package가 ledgerRoot와 ticketSourceRoot의 git common-dir을 직접 검증.

```typescript
export interface LedgerConfig {
  ledgerRoot: string;
  ticketSourceRoot: string;
}
```

### 2.7 Badge는 core-io adapter에

**Badge 재계산은 `@gootte/core-io` adapter에 완전히 남긴다.**

- Ledger는 `replaceOpenFeatures(features)` narrow transition으로 기록
- core-io adapter는 계산만 하고 `replaceOpenFeatures` 호출
- Taskflow는 badge 의존 0
- `@gootte/time-ledger`에 `badge.ts` 두지 않음

### 2.8 pi-taskflow 소비: standalone versioned dist

**소스 코드 경로가 아닌 standalone built package를 소비한다.**

- 배포: **GitHub Release의 standalone `.tgz` asset**
  - exact semver URL + lockfile sha512
  - **npm registry는 현재 `npm whoami` E401이라 채택하지 않음**
- 식별: exact semver + integrity hash로 pin. **caret 금지**
- upgrade/rollback: exact release asset 다운로드 + integrity 검증 → swap
- **live symlink/`file:` protocol/workspace link 금지**
- pi-taskflow는 package API를 호출하여 레코드를 소비

### 2.9 dropFeature 도메인 분리

- **GoOtTe CLI/core-io**: feature 문서 열거, resolved keys batch 생성
- **@gootte/time-ledger**: resolved keys에 대한 batch transition만 수행

### 2.10 단계 분리 (big-bang 금지)

| 단계 | 동작 | 조건 |
|---|---|---|
| T01 | `@gootte/time-ledger` package + parity tests | 기존 CLI가 여전히 주력 |
| T02 | GoOtTe write adapters migration (CLI+migrate+backend async) | T01 완료, parity green |
| T03 | Read-side migration (core-io join/read, badge adapter async, backend app) | T02 완료 |
| T04 | standalone dist + provenance + clean temp install E2E | T03 완료 |
| T05 | cross-repo handoff/runbook | T04 완료 |
| T06 | terminal old-symbol deletion | T03+P01+C01 완료 |

**async ripple:** 현재 `runTimeCommand`, `migrateTime`, `recalcProjectState`는 sync이지만 Ledger API는 Promise/lock retry다. T02에서 CLI/backend를 async로 전환하고, T03에서 core-io badge adapter를 async로 전환한다. runtime 활성화는 C01 전 금지라 intermediate source 단계의 live 혼합 writer 없음.

### 2.11 CLI `--version`

CLI `--version`은 CLI version + ledger implementation version + build commit을 출력.

---

## 3. Follow-up decisions (2026-09-22)

1. **read/derived API 추가:** `resolve/read/readAll/hasTimeRecords`를 T01 public API에 포함. T03가 package read API를 쓸 수 있도록.
2. **pure `timeRecordKey/applyTimeRecords` 소유:** time-ledger가 소유. `@gootte/core` 의존 제거. `@gootte/core`는 parity fixture로 복제 후 T06에서 core versions 삭제.
3. **`replaceOpenFeatures` narrow derived-cache transition:** badge는 외부지만 state write lock은 하나. generic CRUD 계속 금지.
4. **async ripple:** `runTimeCommand`, `migrateTime`, `recalcProjectState` → async. T02에 `cli/src/main.ts`, `cli/src/time.ts`, `cli/src/migrate-time.ts`, `backend/src/routes/time.ts` 포함. T03에 `core-io/src/features.ts` read-side 포함.
5. **artifact generator script:** `code/web/time-ledger/scripts/pack-verify.mjs` 하나로 build→pack→hash→temp install→import→cleanup.
6. **T06 boundary:** `cli/src/time.ts`/`runTimeCommand` thin delegate와 `migrate-time.ts` importLegacy adapter는 삭제하지 않음. `clearState` 제거. fail-closed grep는 direct mutation implementation(`upsertTicketRecord`, `writeTicketRecords`, `removeTicketRecord`, `writeFileSync|renameSync`)만 금지. public symbol 이름 자체를 금지하지 않음.

---

## 4. 미결 문제 / Captain 결정 필요 사항

1. **channel**: npm registry E401 → GitHub Release `.tgz` (확정)
2. **async ripple 정확한 범위**: T02/T03에서 async로 전환할 정확한 함수 목록
3. **T06 fail-closed grep 정확한 금지 경로**: direct mutation implementation 패턴
4. **T01 '8 transitions' → 7 + batchDrop + importLegacy** 정확히 표기

---

## 5. 설계 검증 포인트

- [ ] `@gootte/time-ledger`가 `@gootte/contract`만 의존하는지 (`@gootte/core` 의존 제거)
- [ ] transition API가 generic `write/remove`를 노출하지 않는지
- [ ] `cancel`이 mistaken start만인지
- [ ] `start`에 `update` 옵션, `reopen` 별도인지
- [ ] `TicketRef`를 받고 package가 resolve/validate하는지
- [ ] `resolve/read/readAll/hasTimeRecords` read API가 T01에 있는지
- [ ] `replaceOpenFeatures` narrow derived-cache transition이 있는지
- [ ] badge가 core-io adapter에 있고 time-ledger에 없는지
- [ ] async ripple이 T02/T03에 정확히 반영되어 있는지
- [ ] artifact generator script가 `code/web/time-ledger/scripts/pack-verify.mjs`인지
- [ ] T06 fail-closed가 direct mutation implementation만 금지하는지

---

> **이 설계는 Captain 승인 전까지 commit하지 않습니다.** 승인 후에 T01부터 순차적으로 진행한다.
