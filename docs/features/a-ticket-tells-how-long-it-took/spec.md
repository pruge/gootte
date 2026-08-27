# Specification — a-ticket-tells-how-long-it-took

Status: ready-for-agent (2026-08-27)

결정 근거와 캡틴 원문은 [`grill.md`](grill.md). 이 사양은 그 결정을 구현 계약으로 옮긴 것이다.

## Goal

`plan` 탭과 `steps` 탭에서 티켓에 마우스를 올리면 **그 티켓에 걸린 시간**이 `약 14분` 꼴로 뜬다.
값은 백로그 메모에 적힌 착수·완료 **시각**에서 매번 다시 계산되고, 어디에도 저장되지 않는다.

## User stories

1. 캡틴이 `plan` 탭의 카드 안 티켓 줄에 마우스를 올리면 걸린 시간이 뜬다.
2. `steps` 탭의 티켓 줄에서도 같은 값이 같은 문구로 뜬다.
3. 문구는 `약 14분` 꼴이다 — 어림했다는 것이 문구 자체에 드러난다.
4. 한 시간을 넘으면 `약 2시간 5분` 꼴로 뜬다.
5. 아직 진행 중인 티켓은 지금까지 걸린 시간이 진행 중이라는 표시와 함께 뜬다.
6. 시각 기록이 없는 티켓에는 걸린 시간이 **아예 안 뜬다** — 지어내지 않는다.
7. 기존 hover 문구(상자 뜻 설명 등)를 지우지 않고 나란히 붙는다.
8. 시간 기록이 하나도 없는 프로젝트에서도 화면이 지금과 똑같이 동작한다.

## Scope

- 백로그 메모의 `time:` 줄 파싱.
- 착수·완료 시각 → 사람이 읽는 어림 문구 파생.
- `plan`·`steps` 두 탭의 티켓 hover 에 그 문구 붙이기.

## Out of scope

- 🔴 **gootte 가 GitHub 이나 어떤 외부 서비스를 부르는 것** — `grill.md` D1.
  이 저장소의 서버에는 외부 호출이 하나도 없고, 이 기능이 그 첫 사례가 되지 않는다.
- firstmate 가 `time:` 줄을 적는 절차 — firstmate 홈의 일이고 이 저장소 밖이다.
- 걸린 시간으로 정렬·집계·통계를 내는 것.
- 되짚은 값과 실측한 값을 화면에서 구분하는 것 — `grill.md` D5.

## Decisions

닿는 항구적 규칙(`AGENTS.md` §제품 불변식):

- **INV-1 파생물만** — 🔴 걸린 **분**은 저장하지 않는다. 저장된 것은 **시각**(사실)이고,
  분은 볼 때마다 다시 뺀다. 계산 결과를 계획 DB 에 넣지 않는다.
- **INV-2 읽기 전용** — 백로그를 읽기만 한다. `time:` 줄을 쓰는 것은 firstmate 다.
- **INV-4 결정적·LLM-free** — 시각은 기록에서 읽은 것뿐. 없는 시각을 추정하거나 보간하지 않는다.
- **INV-5 계획은 저장하고 사실은 저장하지 않는다** — 시각은 사실이므로 gootte 의 계획 DB 자리가 아니다.

### 기록 형식 (firstmate 가 쓰고 gootte 가 읽는 계약)

백로그 항목 메모에 한 줄:

```
time: started=2026-08-27T12:48:43+09:00 finished=2026-08-27T13:06:12+09:00
```

- 기존 메모(티켓 경로 등)와 **나란히** 산다 — 덮어쓰지 않는다.
- `finished` 가 없으면 진행 중이다.
- 줄이 아예 없으면 시간을 모른다 — 화면에 아무것도 안 뜬다.

### 어림 규칙 (한 자리에서만 계산한다)

| 걸린 시간 | 문구 |
|---|---|
| 1분 미만 | `약 1분` |
| 1시간 미만 | `약 <N>분` (분 단위 반올림) |
| 1시간 이상, 분이 0 | `약 <H>시간` |
| 1시간 이상 | `약 <H>시간 <M>분` |

진행 중이면 같은 값에 진행 중임을 덧붙인다.

🔴 0분이라고 말하지 않는다 — 일은 분명히 있었다.

## Existing seams / integration points

새 계층을 만들지 않는다.

| seam | 지금 하는 일 | 이 기능이 더하는 것 |
|---|---|---|
| `core/src/parse/backlog.ts` | 백로그 줄 → `BacklogTaskDoc`(메모는 verbatim `note`) | `time:` 줄 파싱 |
| `core/src/project/backlog-join.ts` | 티켓 ↔ 백로그 조인 | 조인 결과에 시각 싣기 |
| `contract/src/index.ts` | `FeatureTicket`·`ProcessRow` | 걸린 시간 문구 칸 |
| `core/src/plan/process.ts` | `ProcessRow` 조립 | 문구 옮겨 싣기 |
| `frontend/.../plan/CardDialog.tsx` | 카드 안 티켓 줄(hover `title=`) | 문구 덧붙이기 |
| `frontend/.../process/ProcessView.tsx` | steps 탭 줄(hover `title=`) | 문구 덧붙이기 |

기존 hover 관례는 `title=` 속성 하나다 — 새 툴팁 부품을 들이지 않는다.

## Data and migration

없다. `time:` 줄이 없는 기존 항목은 그대로 동작하고 화면에 시간이 안 뜰 뿐이다.

## Security / authorization

없음 — 전부 로컬 읽기.

## Compatibility / rollout

한 번에 바뀐다. 시간 기록이 없으면 지금과 동일하게 동작하므로 스위치가 필요 없다.

## Acceptance criteria

1. `time: started=... finished=...` 메모를 가진 티켓이 `plan` 탭 hover 에 `약 N분` 을 보인다.
2. 같은 티켓이 `steps` 탭 hover 에도 **같은 문구**를 보인다.
3. 1시간을 넘으면 `약 H시간 M분`, 분이 0이면 `약 H시간`.
4. 1분 미만은 `약 1분`.
5. `finished` 가 없으면 진행 중임이 문구에 드러난다.
6. `time:` 줄이 없는 티켓에는 시간 문구가 붙지 않는다.
7. 기존 hover 문구가 그대로 살아 있다.
8. `pnpm -C code/web verify` green.

## Verification strategy

- **routine** — 어림 규칙은 순수 함수라 경계값(59초·60초·1시간·1시간 0분)을 단위 시험으로 고정한다.
- 🔴 파싱 픽스처는 **실물 백로그 줄 모양**에서 떠 온다. 이 저장소에는 지어낸 픽스처가
  착지 후 한 번도 동작하지 않은 기능을 통과시킨 전례가 있다.
- **no-mistakes 생략**, 배달 direct-PR — 캡틴 지시 2026-08-27.
