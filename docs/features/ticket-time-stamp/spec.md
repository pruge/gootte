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

### CLI 명령

```
gootte start <feature-slug> <ticket>    # Time: started=<ISO> 삽입
gootte end   <feature-slug> <ticket>    # finished=<ISO> 추가
```

- 프로젝트 경로는 cwd + `GOOTTE_ROOTS` 에서 자동 해결(`resolveProjectPath` 재사용).
- 티켓 파일이 없으면 에러.
- `start` — 이미 `Time:` 줄이 있으면 에러(중복 시작 방지).
- `end` — `Time:` 줄이 없거나 이미 `finished`가 있으면 에러.
- 커밋하지 않는다(grill D3).

### 구현 노트

- `Time:` 줄 파싱은 기존 `parseStatusLine`과 같은 원리 — 펜스 밖에서만 읽는다.
- `BacklogTaskDoc`에서 `startedAt`/`finishedAt` 칸과 `TIME_LINE` 파싱 제거.
- `joinTicketBacklog`에서 `elapsed` 계산 제거.
- `joinTicket`에서 elapsed를 티켓 자체의 `startedAt`/`finishedAt`으로 계산.
- `elapsedPhrase` 함수 자체는 변경 없음.
- `FeatureTicket.elapsed` 계약 칸도 변경 없음 — 입력 원천만 바뀜.

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
