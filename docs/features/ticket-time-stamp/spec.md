# Specification — ticket-time-stamp

Status: ready-for-agent (2026-08-29)

결정 근거와 캡틴 원문은 [`grill.md`](grill.md). 이 사양은 그 결정을 구현 계약으로 옮긴 것이다.

## Goal

CLI 명령 `gootte start <feature> <ticket>` / `gootte end <feature> <ticket>`로 티켓 문서에
작업 시각을 기록하고, gootte 대시보드가 그 시각에서 걸린 시간을 파생해 `plan`·`steps` 탭에
보여준다. 기존 백로그 메모의 `time:` 줄 경로는 완전히 제거한다.

## User stories

1. 캡틴이 `gootte start ticket-done-from-git T01`을 실행하면 해당 티켓 문서에
   `Time: started=<지금 ISO>` 줄이 추가된다.
2. 캡틴이 `gootte end ticket-done-from-git T01`을 실행하면 같은 줄에
   `finished=<지금 ISO>`가 추가된다.
3. 대시보드가 그 시각에서 `약 14분` 문구를 파생해 hover에 보여준다.
4. 백로그 메모에 `time:` 줄이 없어도 티켓 문서 `Time:` 줄이 있으면 시간이 뜬다.
5. 기존 백로그 `time:` 줄은 무시된다(제거).
6. `Time:` 줄이 없는 티켓에는 시간이 안 뜬다 — 지금과 같다.
7. 명령은 파일만 편집하고 커밋하지 않는다 — PR에 묻어간다.

## Scope

- CLI `start`/`end` 명령 추가(gootte CLI).
- 신관례 티켓 파서에 `Time:` 줄 파싱.
- 백로그 파서에서 `time:` 줄 파싱 제거.
- `backlog-join.ts`의 elapsed 경로를 티켓 문서 시각으로 전환.
- 기존 `elapsedPhrase` 순수 함수 그대로 재사용.
- **T04(ADR-0001) — 완료(done) 판정 자체를 `Time:` 줄로 전환**: git 리졸버(`ticket-done-from-git`)와
  백로그 조인 완료 판정을 완전히 제거하고, `finishedAt` 있음=done · `startedAt`만 있음=in_progress ·
  둘 다 없음=pending(queue)으로 판정한다. 아래 "완료 판정 전환(ADR-0001)" 절 참조.

## Out of scope

- 크루 자동화 규칙(firstmate 쪽, grill D4).
- 구관례(`issues/`) 티켓의 시간 기록.
- 걸린 시간 정렬·집계·통계.
- 되짚은 값과 실측 값의 화면 구분.

## Decisions

닿는 항구적 규칙(`AGENTS.md` §제품 불변식):

- **INV-1 파생물만** — 분은 저장하지 않는다. `Time:` 줄에 저장되는 것은 시각(사실)이고,
  분은 볼 때마다 `elapsedPhrase`가 다시 뺀다.
- **INV-2 읽기 전용** — 대시보드·파서는 읽기만 한다. CLI `start`/`end`만 쓴다.
- **INV-4 결정적·LLM-free** — 시각은 CLI가 찍은 것뿐. 없는 시각을 추정하지 않는다.

### 기록 형식

티켓 문서(`tickets/T<NN>.md`) 앞머리에 `Status:` 줄과 나란히:

```markdown
# T01 — 제목
Status: resolved (2026-08-28)
Time: started=2026-08-28T13:08:10+09:00 finished=2026-08-28T13:32:18+09:00
```

- `Status:` 줄과 같은 위치(제목 뒤, 본문 앞).
- `finished`가 없으면 진행 중이다.
- 줄이 아예 없으면 시간을 모른다 — 화면에 아무것도 안 뜬다.

### 어림 규칙

기존 `elapsedPhrase`(core/src/parse/elapsed.ts) 그대로:

| 걸린 시간 | 문구 |
|---|---|
| 1분 미만 | `약 1분` |
| 1시간 미만 | `약 <N>분` (분 단위 반올림) |
| 1시간 이상, 분이 0 | `약 <H>시간` |
| 1시간 이상 | `약 <H>시간 <M>분` |

진행 중이면 `약 N분 진행 중`.

### CLI 명령 (grill D5 — 독립 셸 스크립트)

```
gootte start <feature-slug> <ticket>    # Time: started=<ISO> 삽입
gootte end   <feature-slug> <ticket>    # finished=<ISO> 추가
```

- 🔴 **`@gootte/core`·`@gootte/core-io` 등 TS 모노레포 워크스페이스를 참조하지 않는다.**
  순수 bash 스크립트가 md 파일을 직접 찾아 `sed`/`grep`으로 `Time:` 줄만 쓴다.
- 프로젝트 루트는 **명령을 호출한 위치(cwd)에서 찾는다** — git 루트를 위로 탐색하거나
  `docs/features/<feature-slug>/` 존재를 기준으로 판정. `<프로젝트>` 인자를 받지 않는다.
- 티켓 파일(`docs/features/<feature-slug>/tickets/T<NN>.md`)이 없으면 에러.
- `start` — 이미 `Time:` 줄이 있으면 에러(중복 시작 방지).
- `end` — `Time:` 줄이 없거나 이미 `finished`가 있으면 에러.
- 커밋하지 않는다(grill D3).
- `package.json`(gootte 루트)의 `bin` 필드로 `npm i -g .` 전역 설치 가능해야 한다.

### 구현 노트

- `Time:` 줄 삽입 위치는 `# ` 제목 줄 바로 다음(`Status:` 줄과 같은 자리) — awk/sed로 판정.
- 이 티켓(T01)은 **쓰기만** 한다. gootte TS 파서가 `Time:` 줄을 **읽는** 것은 T02(같은 기능,
  TS 코드 쪽 — 그쪽은 기존처럼 `@gootte/core` 안에서 구현).
- `BacklogTaskDoc`에서 `startedAt`/`finishedAt` 칸과 `TIME_LINE` 파싱 제거(T02).
- `joinTicketBacklog`에서 `elapsed` 계산 제거(T02).
- `joinTicket`에서 elapsed를 티켓 자체의 `startedAt`/`finishedAt`으로 계산(T02).
- `elapsedPhrase` 함수 자체는 변경 없음.
- `FeatureTicket.elapsed` 계약 칸도 변경 없음 — 입력 원천만 바뀜.

## 완료 판정 전환(ADR-0001, T04)

[`adr/0001-time-line-replaces-git-backlog-completion.md`](adr/0001-time-line-replaces-git-backlog-completion.md)가
`ticket-done-from-git` grill.md D1을 뒤집는다 — 자세한 이유는 그 문서를 본다. 여기는 구현 계약만 적는다.

### 새 판정 규칙

```
finishedAt 있음         → done
startedAt 만 있음        → in_progress
둘 다 없음(Time: 줄 없음) → pending(queue)
```

`joinTicket`이 이 규칙만으로 신관례 티켓 상태를 정한다 — git 리졸버 호출도, 백로그 조인 호출도 없다.

### 제거 대상(legacy 완료 처리)

- `code/web/core-io/src/ticket-git-status.ts` — 파일 전체 삭제(리졸버·캐시·`resolveTicketDone`·
  `revalidateTicketGitStatus`).
- `code/web/core-io/src/git.ts`의 `fetchOrigin`·`commitMessagesInRange`·`originMainSha` — 이 리졸버
  전용이라 같이 삭제(다른 소비처 없음, 확인됨).
- `code/web/core/src/project/backlog-join.ts`의 `TicketDoneResolver`/`ticketDoneResolver`/
  `setTicketDoneResolver`, `joinTicket`의 git 체크 블록, `joinTicketBacklog`/`findParentId`/
  `hasChildRow`/`CHILD_ID`/`SECTION_STATUS`(전부 백로그 done 판정 전용) — 전부 삭제.
- `code/web/core/src/parse/feature.ts`의 `parseNewTicket`에서 `Status:` 줄 파싱(`parseStatusLine`
  호출) 제거 — `Time:` 줄 파싱(`parseTimeLine`)만 남긴다. `NewTicketDoc`에서 `status`/`sourceStatus`/
  `statusKnown`/`completedAt` 필드 제거하고 `Time:` 파생 상태로 교체(아래 계약 변경 참조).
  **구관례(`parseTicket`, `issues/`)의 `Status:` 파싱은 건드리지 않는다** — `parseStatusLine` 함수
  자체는 남긴다, 신관례 호출부만 뗀다.
- 리졸버 주입 3곳 — 전부 제거: `code/web/backend/src/app.ts:145`, `code/web/cli/src/commands.ts:24`
  (+ `cliRepoPath`/`cliSlugToPath` slug→경로 헬퍼도 이 용도 전용이라 같이 제거),
  `code/web/scripts/verify-header-badge.ts`(git 리졸버 주입 줄 제거, 스크립트 자체는 남김).
- `code/web/backend/src/snapshot-revalidator.ts` — `fetchOrigin`/`revalidateTicketGitStatus` 호출과
  `ticketGitChanged`/`{ kind: "ticket" }` 발신 제거. `revalidateSnapshot` 기반 프로젝트 변경 감지는 유지.
- `code/web/contract/src/index.ts` — `ChangeEvent`의 `z.object({ kind: z.literal("ticket") })` 변형 제거.
- `code/web/frontend/src/lib/live.ts` — `ev.kind === "ticket"` 분기 제거(`ticketDone` 쿼리 무효화 —
  그 쿼리 자체를 정의하는 곳이 없어 이미 죽은 배선, 같이 정리).
- `FeatureTicket.backlogStatus`/`backlogUrl` — 실제 렌더 소비처 없음(테스트에만 존재), 계약에서 제거.

### 유지 대상(범위 밖으로 남김)

- `FeatureTicket.completedAt` — **구관례(`issues/`) 티켓의 `Status: resolved (날짜)` 완료일** 표시용.
  `TicketRow.tsx`가 실제로 렌더한다(200~203행). 구관례는 이 ADR 범위 밖 — `parseTicket`/`toTicket`
  경로는 그대로 둔다. 신관례(`toNewTicket`)만 `completedAt`을 안 채우게 됨(자연히 `undefined`).
- `code/web/backend/src/watchers.ts`의 `kind: "backlog"`/`kind: "project"` 발신 — 이건 백로그 조인의
  나머지 용도(대기 재계산 등 완료 판정 아닌 부분)와 프로젝트 파일 변경 감시용, 건드리지 않는다.
  단, 신관례 티켓의 상태가 이제 `Time:` 줄(문서 자체) 파생이므로, 문서 변경은 기존 `project` 감시
  경로로 이미 잡힌다(별도 배선 불필요, 확인됨).
- `elapsedPhrase`, `FeatureTicket.elapsed` — 변경 없음(기존 계획대로).

### 검수 전용 티켓(구현 코드 없는 티켓)

`ticket-time-stamp-t03`류(캡틴이 화면을 보고 판단하는 종착 티켓)는 개발 코드가 없어 `gootte start`/
`end`를 자연스럽게 호출할 지점이 없다. 이런 티켓은 캡틴이 검수를 마치면 형식적으로
`gootte start <slug> <num>` 후 `gootte end <slug> <num>`을 호출해 완료로 표시한다(ADR-0001의 대가,
문서에 명시됨). 이 티켓(T04)은 그 워크플로 자체를 만들지 않는다 — 규칙만 문서화한다.

## Existing seams / integration points

| seam | 지금 하는 일 | 이 기능이 바꾸는 것 |
|---|---|---|
| `cli/src/main.ts` | `step`, `board` 등 명령 라우팅 | `start`/`end` 명령 추가 |
| `cli/src/commands.ts` | CLI 로직 | `startText`/`endText` 함수 |
| `core/src/parse/feature.ts` | 신관례 티켓 파싱(Status 줄) | `Time:` 줄 파싱 추가 |
| `core/src/parse/backlog.ts` | 백로그 메모 파싱(time: 줄) | `time:` 줄 파싱 **제거** |
| `core/src/project/backlog-join.ts` | 조인 결과에 elapsed 싣기 | elapsed 원천을 티켓으로 전환 |
| `contract/src/index.ts` | `FeatureTicket.elapsed` | **변경 없음** |
| `core/src/parse/elapsed.ts` | 어림 문구 계산 | **변경 없음** |

## Data and migration

없다. `Time:` 줄이 없는 기존 티켓은 그대로 동작하고 시간이 안 뜰 뿐이다.
기존 백로그 `time:` 줄은 무시된다(파싱 코드 제거).

## Security / authorization

없음 — 전부 로컬 파일 읽기/쓰기.

## Compatibility / rollout

한 번에 바뀐다. `Time:` 줄이 없으면 지금과 동일하게 동작하므로 스위치가 필요 없다.

## Acceptance criteria

1. `gootte start ticket-done-from-git T01` → 티켓 파일에 `Time: started=<ISO>` 삽입.
2. `gootte end ticket-done-from-git T01` → 같은 줄에 `finished=<ISO>` 추가.
3. 대시보드에서 그 티켓의 hover에 `약 N분` 문구가 뜬다.
4. 백로그 메모의 `time:` 줄은 무시된다.
5. `Time:` 줄이 없는 티켓에는 시간이 안 뜬다.
6. 이미 시작된 티켓에 `start` → 에러.
7. 시작 안 된 티켓에 `end` → 에러.
8. `pnpm -C code/web verify` green.

## Verification strategy

- **routine** — CLI 명령은 파일 쓰기 결과를 단위 시험으로 고정. 파서는 실물 티켓
  문서에서 떠온 픽스처로 검증.
- 🔴 파싱 픽스처는 **실물 티켓 문서 모양**에서 떠 온다.
- **no-mistakes 생략**, 배달 direct-PR.
