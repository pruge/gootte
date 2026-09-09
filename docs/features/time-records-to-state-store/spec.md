# time-records-to-state-store — 티켓 시간·상태 기록의 SoT를 state.json으로 전환

Status: draft (2026-09-09)

## 캡틴 지시 (원문)

> "gootte가 state.json 으로 시간을 기록하기로 되어있고, 그것을 구현했으니, 문서안의 status와 time을 삭제하고 state.json으로 migrate 가능한지 버그는 없는지 확인해줘."

결정(2026-09-09 대화):
1. 이관 대상 프로젝트 = **gootte 자신만** — 다른 관리대상은 MD 읽기 폴백으로 계속 동작
2. 이관은 **티켓 수준** `Time:`·`Status:` 기록만 — 기능 수준 `spec.md` `Status:`는 gootte가 쓰지 않으므로 MD 유지
3. **MD 줄 삭제는 보류** — 모두 이관하고 문제 없을 때 별도 후속 기능으로 삭제
4. INV-1/D1 변경 승인 — 티켓 시간 기록은 INV-5 저장(write-time 캡처, 원본 재생성 불가)

## Goal

`bin/gootte start/pause/resume/end/cancel/drop`이 쓰는 티켓 시간·상태 기록을
`<프로젝트>/.gootte/state.json` v2(`tickets` 맵)로 옮긴다. 읽기 경로는
레코드가 있는 프로젝트에서 레코드를, 없는 프로젝트에서 기존 MD 줄을 읽는다.

## User stories

1. gootte에서 `gootte start`하면 티켓 MD가 아니라 state.json에 기록된다
2. 화면·CLI·백엔드가 같은 레코드를 보고 같은 상태를 말한다
3. worktree에서 기록하면 메인 프로젝트의 state.json에 반영된다
4. 미이관 프로젝트(jinwooauto 등)는 지금과 완전히 같게 동작한다
5. state.json이 깨지면 조용히 빈 상태가 되지 않는다(검증된 실패)

## Architecture

### state.json v2

```json
{
  "version": 2,
  "updatedAt": "…",
  "openFeatures": [],              // 기존 파생 캐시 유지(배지)
  "tickets": {
    "<기능>/<티켓 슬러그>": {
      "startedAt": "…|null",
      "finishedAt": "…|null",
      "pauses": [{ "pausedAt": "…", "resumedAt": "…|null" }],
      "statusRaw": "resolved (2026-09-09)|null"   // MD Status: 줄과 동일 verbatim
    }
  }
}
```

- `statusRaw`는 INV-4 릴레이 — 해석(여덟 값→다섯 값, completedAt)은 읽기 경로 몫
- `openFeatures`는 여전히 파생물 — 갱신 시 `tickets`를 보존하는 read-modify-write

### 읽기 우선순위(모드 판정)

- 프로젝트에 v2 state.json(version 2)이 있으면 **레코드가 권위** — 레코드 없는 티켓은
  미시작 pending(MD 줄은 무시한다 — 이중 SoT 금지, 캡슐화된 낡은 줄이 되살아나지 않게)
- v2가 없으면 기존 MD 파싱 그대로(타 관리대상·미이관 프로젝트)

### 쓰기

- `bin/gootte`가 v2 state.json을 발견하면 시간 명령을 TS CLI로 위임 — JSON 편집은
  테스트 가능한 core-io에서. 없으면 기존 bash MD 경로(타 프로젝트)
- 레코드는 항상 **메인 프로젝트**의 state.json에 기록 — worktree는
  `.gootte/config.json`(`mainProject`)으로 메인을 찾고, 없으면
  `git rev-parse --git-common-dir`로 추론해 생성한다

## Scope

- contract: `TicketTimeRecord`·`ProjectStateV2` zod 스키마
- core-io/state-store: `readTicketRecords`·`upsertTicketRecord`·`removeTicketRecord`·
  `recalcProjectState`(read-modify-write)·readState zod 검증
- core: `applyTimeRecords(features, records)` 순수 함수 — 조인의 유일한 판정 자리
- 읽기 소비처 3곳 배선: 백엔드 `featuresFor`·CLI(`status/board/next`)·`routes/time`
- bin/gootte 모드 분기 + TS time 명령 + worktree config.json 자동 생성
- `gootte migrate-time [--dry-run]` 이관 명령(재파싱 대조 리포트, 멱등)
- T12 훅 결함 수정(전 명령 확장 + ticket 기준 배지 규칙, MD 모드)
- 문서: AGENTS.md(INV-1 예외)·issue-tracker·triage-labels·gootte-ticket 스킬

## Out of scope

- MD `Time:`/`Status:` 줄 삭제 — 별도 후속 기능(모두 이관·검증된 뒤)
- 기능 수준 `spec.md` `Status:` 이관 — gootte가 쓰지 않는다
- 타 관리대상 프로젝트 이관 — `migrate-time` 명령으로 나중에 얼마든지 가능
- plan.db·백로그 조인 변경 없음

## Decisions

- **D1(개정)** — 티켓 시간 기록은 INV-5 저장이다. MD `Time:` 줄을 지우는 순간
  원본을 다시 읽어 재생성할 수 없는 값이므로(사람·에이전트가 행한 행위의 기록)
  state.json이 저장할 자격을 갖는다. 기능·티켓 본문(제목·Blocked by·spec)의 SoT는 여전히 MD(INV-1 유지)
- **D2** — 읽기 모드는 프로젝트 단위로 이분법이다. v2 있으면 레코드만, 없으면 MD만 —
  티켓별 혼합은 cancel 뒤의 낡은 MD 줄이 되살아나는 이중 SoT를 만든다
- **D3** — `statusRaw`는 verbatim 원문이다. 해석 자리는 읽기 한 곳(parseStatusLine 경유)
- **D4** — 레코드 쓰기는 항상 메인 프로젝트 state.json이다. worktree 사본에는 쓰지 않는다

## Existing seams / integration points

- `code/web/contract/src/index.ts` — 스키마 추가
- `code/web/core-io/src/state-store.ts` — 저장소 확장(기존 `updateProjectState` 덮어쓰기 결함 수정)
- `code/web/core/src/project/` — `applyTimeRecords` 신설(`applyInProgress`와 같은 조인 패턴)
- `code/web/backend/src/app.ts` — `featuresFor` 조인 배선
- `code/web/cli/src/commands.ts` — `featureStateText`/`boardText`/`nextText` 조인 배선
- `code/web/backend/src/routes/time.ts` — 기록 뒤 스캔 기록에 조인
- `bin/gootte` — 모드 분기·위임, T12 훅
- `scripts/tests/gootte-time.test.sh` — bash 회귀(state.json 모드 케이스 추가)

## Acceptance criteria

- `pnpm verify` 전체 회귀 통과
- gootte에서 `gootte start/end`가 state.json 레코드를 쓰고 화면·CLI가 같은 값을 본다
- 미이관 프로젝트 픽스처로 기존 동작 회귀 없음을 테스트가 고정
- `migrate-time --dry-run`이 144장 티켓의 이관 대상을 정확히 리포트한다

## Verification strategy

각 티켓 완료 시 `pnpm verify`. T07에서 gootte 자신에 이관 실행 후
CLI·백엔드·화면 실물 확인. 최종 T08에서 문서와 코드의 일치 확인.
