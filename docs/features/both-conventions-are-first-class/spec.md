# Specification — both-conventions-are-first-class

Status: ready-for-agent (2026-08-26)

## 캡틴 지시 (원문)

> gootte 에서 신 ticket을 읽어도 읽음 표시가 안처리된다.
> 1. 과거 issues 에서 처리하는것을 모두 조사.
> 2. 신 tickets에서 모두 처리하는지 확인하라.

## 문제

gootte 는 티켓 관례가 둘이다.

- **구관례** `docs/features/<기능>/issues/<NN>-<슬러그>.md` — 상태의 출처가 문서 자신
- **신관례** `docs/features/<기능>/tickets/T<NN>.md` — 상태의 출처가 firstmate 백로그 (T04, #58)

신관례가 들어온 뒤로 "구관례만 아는 자리" 를 하나씩 발견해 고쳐 왔다 — #63(판), #64(features 화면), #65(남은 티켓 읽기).
전부 같은 부류다: **어떤 자리가 티켓을 경로 모양으로 판별하는데 그 모양이 `issues/` 하나뿐이다.**

이번 캡틴 보고("신 ticket 을 읽어도 읽음 표시가 안 된다")도 정확히 그 부류이고,
전수 조사에서 **아직 안 고쳐진 것이 정확히 둘** 남아 있다.

## 실측 (2026-08-26, `origin/main` = `36132ff`)

전수 조사 방법: 경로 모양으로 관례를 가르는 자리를 다섯 갈래로 훑었다 —
(A) 경로 접두 비교, (B) 관례 폴더를 담은 정규식, (C) `docConvention` 소비처,
(D) `allTickets` 소비처, (E) `newTickets` 소비처.
아래는 **실제 grep 출력을 옮겨 적은 것**이지 요약이 아니다.

| # | 사실 | 근거 |
|---|---|---|
| F1 | 🔴 **읽음을 기록하는 자리가 하나뿐이고, 그 문이 `issues/` 로만 열린다** | `backend/src/app.ts:469` — `if (path.startsWith("issues/")) {` |
| F2 | 🔴 **기능을 넘는 선행 링크를 푸는 정규식도 `issues/` 만 안다** | `core/src/parse/feature.ts:163` — `const CROSS_FEATURE_PATH = /([^/]+)\/issues\/(\d{1,3})-/;` |
| F3 | 🟢 판정하는 쪽(`applyReadState`)은 **이미 두 관례를 다 본다** | `core/src/project/read-state.ts:24`·`:27`·`:32` |
| F4 | 🟢 첫 깔기(`ensureReadSeed`)도 **이미 두 관례를 다 본다** | `core-io/src/plan-store.ts:385` — `for (const f of features) for (const t of allTickets(f))` |
| F5 | 🟢 커밋→티켓 잇기는 **이미 두 관례를 다 본다** | `core/src/parse/ticket-path.ts:21` — `/^docs\/features\/([^/]+)\/(issues\|tickets)\/([^/]+)\.md$/i` |
| F6 | 🟢 `read_mark` 를 쓰는 자리는 둘뿐이고 둘 다 확인했다 | `core-io/src/plan-store.ts:356`(문서 열기) · `:383`(첫 깔기) |
| F7 | 🟢 화면이 읽음을 클라이언트에서 기록하는 길은 **없다** | frontend 전체에 `markRead`·`read_mark` 참조 0건 |
| F8 | 🔴 읽음 기록 시험 세 개가 **전부 구관례 경로만** 쓴다 | `backend/test/app.test.ts:555~581` — `issues/01-a.md` 만 등장 |
| F9 | 🔴 `parseCrossFeatureRef` 시험도 **전부 구관례 링크만** 쓴다 | `core/src/parse/feature.test.ts:274~300` |
| F10 | 🟢 그 밖에 관례를 가르는 자리는 **없다** — (A)는 F1 하나, (B)는 F2·F5 둘, (C)`docConvention` 은 화면 배지 분기(설계상 옳다), (D)(E)는 전부 두 관례 병합 | 위 다섯 갈래 grep 전량 |

## F1 이 만드는 사용자 눈에 보이는 결함

판정하는 쪽은 두 관례를 다 보는데(F3) 기록하는 문은 구관례만 연다(F1).
따라서 신관례 티켓은 **"안 읽음" 이 될 수는 있어도 "읽음" 이 될 길이 없다** — 영원히 초록이다.

반증 시험(실제 실행):

| 연 문서 | 읽음으로 기록되나 |
|---|---|
| `issues/01-x.md` | ✅ |
| `tickets/T01.md` | ❌ |
| `tickets/T04.md` | ❌ |
| `spec.md` | ❌ (의도된 것 — 표시는 티켓에만, 캡틴 결정 ②) |

파급은 읽음 표시 하나로 끝나지 않는다. `ticket.unread` 는 아래로 흐른다:

- 티켓 줄의 "안 읽음" 표시 (`features`·`plan`·`process` 세 탭)
- 기능 카드 머리글의 초록 (`hasUnreadTicket`)
- **판의 대기 복귀** (`planReopen` — 예약·폐기·완료 칸의 카드에 안 읽은 티켓이 있으면 대기로 돌려보낸다)

즉 신관례만 쓰는 기능은 **닫아 둔 카드가 계속 대기로 되올라온다** — 캡틴이 아무리 읽어도.

## F2 가 만드는 사용자 눈에 보이는 결함

`Blocked by:` 에 다른 기능의 티켓을 markdown 링크로 걸 수 있다.
그 링크가 신관례를 가리키면 경로가 안 풀린다.

반증 시험(실제 실행):

| 링크 | 해소되나 |
|---|---|
| `[03](../../other-feature/issues/03-x.md)` | ✅ `other-feature#03` |
| `[T03](../../other-feature/tickets/T03.md)` | ❌ `NULL` — 영영 막힌 채 |

안 풀리면 그 항목은 `unreadable` 로 남아 **선행이 끝나도 착수 가능으로 안 바뀐다.**

## 설계

### 판정 자리를 새로 만들지 않는다

두 결함 다 **이미 있는 한 자리의 조건을 넓히는 것**이다.
새 함수·새 표·새 응답 칸을 만들지 마라 — 그러면 관례가 늘 때마다 고칠 자리가 또 갈린다.

### 관례 목록은 이미 코드 안에 있다

`core/src/parse/ticket-path.ts:21` 의 `(issues|tickets)` 가 **이 저장소가 아는 관례의 목록**이다.
새로 넓히는 두 자리는 그 목록과 같은 뜻이어야 한다.

### 티켓만 표시한다는 결정은 그대로다

캡틴 결정 ②(`unread-tickets-show-themselves/spec.md`)는 살아 있다 —
`spec.md`·`adr/`·`grill.md` 는 열어도 읽음 기록이 남지 않는다.
신관례 폴더 안이라도 **`T<NN>.md` 모양이 아닌 파일은 티켓이 아니다**(`core-io/src/features.ts:71` 이 그 모양만 줍는다).

## 이 기능이 하지 않는 것

- 구관례를 없애는 일 — 두 관례는 당분간 공존한다
- 세 번째 관례를 위한 일반화·설정·플러그인 — 관례는 둘뿐이고, 늘어나면 그때 정한다
- 읽음을 문서 수정 시각으로 다시 여는 일 — 캡틴이 이미 "새 문서만" 으로 닫았다
- 화면·색·문구 변경 — 표시 자체는 이미 옳다

## 완료 조건

- [ ] 신관례 티켓을 열면 읽음이 되고 초록이 풀린다
- [ ] 신관례 티켓을 가리키는 기능 간 선행 링크가 그 티켓 완료 시 풀린다
- [ ] 두 결함 다 **신관례 경로를 쓰는 회귀 시험**을 남긴다(F8·F9 가 이번엔 안 되풀이되게)
