# @gootte/time-ledger — 공용 package 경계 제안서

> **목적:** 중복 구현 제거를 위해 시간 레코드 관련 논리를 `@gootte/cli`에서 분리, `@gootte/time-ledger`라는 독립 package로 통합.
> **승인 대기 중 — Captain(w43:p1) 승인 후 구현.**
> **Commit D 완료 후 revised note. 구현 금지.**

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
    ├── ledger.ts         # Transition API + TicketRef resolve
    ├── types.ts          # Ledger-specific types, TicketRef, ResolvedTicketKey
    ├── lock.ts           # File hash/CAS + cross-process lock
    └── test/
        ├── ledger.test.ts
        ├── lock.test.ts
        └── transition.test.ts
```

**의존성:**
- `@gootte/contract` (TicketTimeRecord, ProjectStateV2 types)
- `@gootte/core` (timeRecordKey, applyTimeRecords)
- **의존하지 않음:** `@gootte/core-io`, `@gootte/cli`

### 2.2 상태 유지 (state.json v2)

**초기 extraction은 `.gootte/state.json` v2와 `TicketTimeRecord` shape를 그대로 유지한다.**

- record별 `version`/`provenance` 필드 **추가 금지** (라이브 migration·기존 zod 파손 방지)
- package provenance는 `package.json` semver + CLI `--version`이 담당
- writer audit은 별도 미래 event log이지 ticket record가 아님
- package 초기 semver: `0.1.0`

### 2.3 API: Transition API (generic CRUD 금지)

```typescript
// @gootte/time-ledger/src/types.ts

/** package가 resolve/validate하는 ticket 참조. raw key는 public API에 노출하지 않는다. */
export interface TicketRef {
  feature: string;
  ticket: string;
}

/** package가 발급하는 branded key — batchDrop에서만 사용. */
export interface ResolvedTicketKey {
  key: string;       // timeRecordKey 형식: "<feature>/<slug>"
  feature: string;
  ticketSlug: string;
}

export interface LedgerResult {
  ok: true;
  record: TicketTimeRecord;
}
export interface LedgerConflict {
  ok: false;
  reason: "not-active" | "already-finished" | "in-progress" | "not-ended" | "not-cancelled" | "dropped" | "not-found" | "different-repo" | "lock-timeout" | "hash-mismatch";
}
```

```typescript
// @gootte/time-ledger/src/ledger.ts

export interface Ledger {
  /**
   * start — 티켓이 미시작 상태여야 시작.
   * update?: true이면 active + pauses.length==0 + not dropped에서 startedAt만 갱신;
   *   finished/reopened/pause history에는 거부.
   * at: 필수 (ISO 8601). 기본값 없음.
   */
  start(ref: TicketRef, at: string, options?: { update?: boolean }): Promise<LedgerResult | LedgerConflict>;

  /** active 상태에서만 pause 가능. at 필수. */
  pause(ref: TicketRef, at: string): Promise<LedgerResult | LedgerConflict>;

  /** open pause가 있을 때만 resume 가능. at 필수. */
  resume(ref: TicketRef, at: string): Promise<LedgerResult | LedgerConflict>;

  /** active + 모든 pause가 resumed 상태에서만 end 가능. finishedAt 기록. at 필수. */
  end(ref: TicketRef, at: string): Promise<LedgerResult | LedgerConflict>;

  /**
   * cancel — mistaken start만 취소.
   * 조건: record 존재, startedAt != null, finishedAt == null, pauses.length == 0, statusRaw이 not wontfix.
   * 결과: record 삭제.
   * 그 외 모든 경우 거부.
   */
  cancel(ref: TicketRef): Promise<LedgerResult | LedgerConflict>;

  /** 시작·완료 기록 보존, status만 wontfix로 변경. at 필수. */
  drop(ref: TicketRef, at: string): Promise<LedgerResult | LedgerConflict>;

  /**
   * reopen — ended + not dropped만 허용.
   * 결과: 새 startedAt, finishedAt = null, pauses = [].
   * 명시 호출만. at 필수.
   */
  reopen(ref: TicketRef, at: string): Promise<LedgerResult | LedgerConflict>;

  /**
   * 기능별 batch transition. package가 발급한 ResolvedTicketKey[]만 받거나,
   * 내부 resolve 결과를 직접 받는다.
   * 존재하지 않는 ticket이나 다른 repo source는 fail-closed.
   */
  batchDrop(feature: string, keys: ResolvedTicketKey[], at: string): Promise<(LedgerResult | LedgerConflict)[]>;
}
```

**TicketRef resolve:** package가 `ticketSourceRoot` working tree → `git cat-file -e HEAD:<rel>` fallback으로 resolve/validate. 없는 ticket이나 다른 repo는 fail-closed. `batchDrop`만 `ResolvedTicketKey[]` 또는 내부 resolve 결과를 받는다.

**at 필수/기본 처리:** 모든 transition에서 `at`은 필수이며 기본값이 없다. 호출 위치에서 `resolveTime`로 해석한다.

**왜 transition API인가:** raw `write/remove`를 public으로 노출하면 CLI와 taskflow가 semantics를 다시 구현한다. transition API가 authority를 보장한다.

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

**기존 CLI drift/compat plan:**
- `reset`은 기존 CLI 호환을 위해 `cancel` adapter로 격리. Taskflow API에서 `reset` 노출 금지.
- `drop <기능>` (기능 전체 폐기)은 GoOtTe CLI에서 feature 문서 열거 후 `batchDrop` 호출. ledger package는 `ResolvedTicketKey[]`만 받음.

### 2.5 CAS: 파일 document hash/revision 단위

**key nonce가 아닌 file document hash/revision 단위 CAS.**

**Default parameters:**
- lock deadline: **2000ms**
- bounded retry: **10→100ms jittered**, deadline 기준
- stale reclaim: same-host lock age **≥30ms** **그리고** owner PID 부재일 때만
- document hash mismatch: **최대 3회 재시도** 후 explicit conflict
- unique temp + fsync file + rename + possible directory fsync + readback
- config override 가능하지만 위가 default

```
1. acquire lock (O_EXCL + owner token)
2. read file, compute hash/revision
3. compare hash → unique temp file
4. fsync + rename
5. readback verify
6. release lock
```

- 실패는 explicit conflict, 조용한 overwrite 금지
- lock deadline 초과 → `LedgerConflict.lock-timeout`

### 2.6 ledgerRoot/ticketSourceRoot — 내부 검증

**`LedgerConfig.gitVerified` 필드 제거.** package가 ledgerRoot와 ticketSourceRoot의 git common-dir을 직접 검증. caller 주장을 받지 않는다.

```typescript
export interface LedgerConfig {
  ledgerRoot: string;    // state.json 이 있는 메인 프로젝트
  ticketSourceRoot: string; // 티켓 파일이 있는 worktree
}
```

`createLedger(config)` 내부에서 `git rev-parse --git-common-dir`로 양쪽이 같은 git 저장소인지 fail-closed 검증.

### 2.7 Badge는 time-ledger 밖에 있음

**Badge 재계산은 `@gootte/core-io`/CLI adapter에 완전히 남긴다.**

- Ledger는 `tickets` mutate 시 기존 `openFeatures`를 **lossless 보존**
- GoOtTe adapter만 mutation 뒤 best-effort recompute
- Taskflow는 badge 의존 0
- `@gootte/time-ledger`에 `badge.ts` 두지 않음

### 2.8 pi-taskflow 소비: standalone versioned dist

**소스 코드 경로가 아닌 standalone built package를 소비한다.**

- 배포: **GitHub Release의 standalone `.tgz` asset**
  - 공개 gootte repo tag, exact semver URL + lockfile sha512
  - **npm registry는 현재 `npm whoami` E401이라 채택하지 않음**
  - 대안: GitHub package (private repo 시) 또는 pack artifact (오프라인 환경)
- 식별: exact semver + integrity hash로 pin. **caret 금지** (`0.1.x` 시작, `^0.1.0` 금지)
- upgrade/rollback: exact release asset 다운로드 + integrity 검증 → swap
- **live symlink/`file:` protocol/workspace link 금지**
- pi-taskflow는 package API를 호출하여 레코드를 소비하며, `.gootte/state.json`을 직접 읽지 않음
- state schema v2와 package semver를 혼동하지 않음

### 2.9 dropFeature 도메인 분리

- **GoOtTe CLI/core-io**: feature 문서 열거 (`readFeatures`), resolved keys batch 생성
- **@gootte/time-ledger**: resolved keys에 대한 batch transition만 수행
- **역의존 금지**: ledger package가 feature 문서 구조를 알지 않음

### 2.10 단계 분리 (big-bang 금지)

| 단계 | 동작 | 조건 |
|---|---|---|
| 1 | `@gootte/time-ledger` package + parity tests | 기존 CLI가 여전히 주력 |
| 2 | GoOtTe CLI가 `@gootte/time-ledger`로 전환 | parity tests green |
| 3 | pi-taskflow가 versioned package API로 전환 | CLI 전환 완료 |
| 4 | 기존 `@gootte/cli` 내 time 함수 삭제 | step 3 green |
| 5 | `@gootte/core` + `@gootte/core-io`의 옛 time 구현 삭제 | step 4 green, **모든 consumer 전환 증거 후** |
| 6 | terminal: `@gootte/core-io` state-store time 함수 제거 | step 5 green |

각 단계: manual files 지정, rollback plan, dual-writer 금지 조건 명시.

**Runtime 활성화 — quiescent coordinated cutover:**
Source 단계는 순차여도 runtime 활성화는 quiescent coordinated cutover이다:
- package/GoOtTe/Pi 모두 준비 → lifecycle write 중지 확인 → 둘 다 version pin 전환 → parity/readback → 재개
- GoOtTe만 새 global 설치해 혼합 runtime을 만들지 않는다
- rollback도 같은 quiescent 절차
- migration window를 숨기지 말라: lock을 모르는 pi-taskflow writer가 공존할 수 있음을 명시

### 2.11 CLI `--version`

CLI `--version`은 CLI version + ledger implementation version + build commit을 출력. record provenance는 추가하지 않음 (§2.2).

---

## 3. 미결 문제 / Captain 결정 필요 사항

위 10개 결정은 모두 반영됨. 미결 항목은 없음. 별도 wayfinder/ticket으로 단계별 exact manual files/first test/rollback/terminal condition을 제출해야 한다.

## 4. 설계 검증 포인트

- [ ] `@gootte/time-ledger`가 `@gootte/core`와 `@gootte/contract`만 의존하는지
- [ ] transition API가 generic `write/remove`를 노출하지 않는지
- [ ] `cancel`이 mistaken start만 (record 삭제, 아닌 "시작 전 삭제")인지
- [ ] `start`에 `update` 옵션이 있고, `reopen`이 별도인지
- [ ] `TicketRef`를 받고 package가 resolve/validate하는지
- [ ] badge 재계산이 time-ledger 밖에 있는지
- [ ] pi-taskflow가 standalone `.tgz` + exact semver로 소비하는지
- [ ] CAS default가 lock 2000ms, retry 10-100ms, stale 30s+PID인지
- [ ] quiescent coordinated cutover가 명시되어 있는지
- [ ] `@gootte/core`의 time 함수도 단계 5 삭제 대상인지
- [ ] step 5가 core-io만 deprecate가 아닌 모든 consumer 전환 후인지

---

> **이 설계는 Captain 승인 전까지 commit하지 않습니다.** 승인 후에 1단계부터 순차적으로 진행한다. 구현 티켓이 아닌 architecture decision이다.
