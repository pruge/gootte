# Specification — the-header-agrees-with-its-tickets

Status: ready-for-agent (2026-08-26)

## 캡틴 보고 (원문, 2026-08-26)

> features 의 탭에서 feature 카드가 남은 일이 0개임에도 header에 ready-for-agent가 나온다.
> 아마도 구 관례대로 처리해서 그럴것이다. 신 관례에 맞게 처리가가능하도록 하자.

> feature는 만들었지만, 개발을 내가 취소한경우 wontfix를 띄우는 경우도 잇었다.
> 신관례에서는 어떻게 처리가능한가?

## 문제 1 — 머리글이 자기 숫자와 모순한다

기능 카드 머리글의 상태 배지는 `spec.md` 의 손으로 쓴 `Status:` 줄을 **verbatim 으로 그린 것**이다.
계산값이 아니다.

    code/web/frontend/src/components/features/FeatureCard.tsx:103-109   {feature.sourceStatus} 를 그대로 출력
    code/web/core/src/project/features.ts:191-194                       docs.spec 에서 그대로 옮긴다
      title:        docs.spec?.title ?? docs.slug,
      status:       docs.spec?.status ?? "pending",
      sourceStatus: docs.spec?.sourceStatus ?? null,
      statusKnown:  docs.spec?.statusKnown ?? false,

구관례(`issues/`)는 **문서가 상태의 SoT** 라 이 설계가 옳았다.
신관례(`tickets/`)는 SoT 가 백로그이고, `applyBacklogStatus` 는 기능 수준
`sourceStatus`·`statusKnown` 을 건드리지 않는다(grep 0건 — 그 함수는 `newTickets` 만 손댄다).

그래서 같은 머리글 한 줄이 이렇게 자기모순한다:

    남은 일 0 · 완료 2 · 착수 가능 0 · 처리중 0        ← 계산값(정확)
    ready-for-agent                                    ← 2026-08-26 에 손으로 적은 글자(썩음)

앞의 네 수는 `counts()`(FeatureCard.tsx:13-21)가 티켓에서 매번 다시 세고,
뒤의 배지만 문서에 박제된 값이다.

### 범위 실측 (신관례 기능 6개)

    a-vanished-card-breaks-nothing         티켓 1  | Status: ready-for-agent (2026-08-26)
    both-conventions-are-first-class       티켓 3  | Status: ready-for-agent (2026-08-26)
    every-home-reports-its-status          티켓 2  | Status: ready-for-agent (2026-08-26)
    the-terminal-agrees-with-the-screen    티켓 2  | Status: ready-for-agent (2026-08-26)
    steps-start-from-dependencies          티켓 3  | (Status 줄 없음 → 배지가 아예 안 뜸)
    tauri-desktop-app                      티켓 5  | (Status 줄 없음 → 배지가 아예 안 뜸)

신관례 기능끼리도 이미 제각각이다 — 넷은 썩은 글자를 띄우고 둘은 아무것도 안 띄운다.

## 문제 2 — 신관례에는 "취소" 를 표현할 수단이 없다

구관례는 `Status: wontfix` 를 `dropped` 로 사상해 취소를 표현했다:

    code/web/core/src/parse/feature.ts:61-64   mapFirstmateStatus
      if (value === "resolved") return "done";
      if (value === "wontfix")  return "dropped";
      return "pending";

    실측: parseStatusLine + mapFirstmateStatus
      "Status: wontfix"                      -> value=wontfix          mapped=dropped
      "**Status:** wontfix"                  -> value=wontfix          mapped=dropped
      "Status: ready-for-agent (2026-08-26)" -> value=ready-for-agent  mapped=pending
      "Status: resolved (2026-08-12)"        -> value=resolved         mapped=done

신관례에는 그 자리가 없다. 백로그 조인이 만들 수 있는 상태는 셋뿐이다:

    code/web/core/src/project/backlog-join.ts:10-14   SECTION_STATUS
      in_flight -> in_progress
      queued    -> pending
      done      -> done

`tasks-axi` 에도 취소 상태가 없다(`rm`=기록 소멸, `hold`=대기, `done`=했다고 거짓말).

### 🔴 이건 표시 문제가 아니라 판정 문제다

`dropped` 는 배지가 아니라 **여러 판정의 입력**이다:

    code/web/core/src/project/features.ts:214   hasOpenWork      — 남은 일에서 빠진다
    code/web/core/src/plan/next.ts:44           computeNext      — 다음 할 일에서 건너뛴다
    code/web/core/src/plan/close.ts:26,138      계획판 종료·안읽음 방아쇠
    code/web/core/src/project/in-progress.ts:64 처리중 표시에서 제외

그러므로 신관례 기능을 캡틴이 취소하시면 **그 티켓들이 영원히 "남은 일" 로 남고**
`next` 가 계속 그것을 다음 할 일이라고 말한다 — 오늘 아침 고친 것과 같은 종류의 거짓말이다.

## 결정 (캡틴 승인 2026-08-26)

### D1 — 진행 상태는 계산하고, 취소는 선언한다

두 출처는 **다른 질문에 답한다.** 중복이 아니다.

| 질문 | 성격 | 출처 |
|---|---|---|
| 얼마나 진행됐나 (대기·처리중·완료) | 일이 진행되며 저절로 바뀌는 **사실** | 백로그 조인 (계산) |
| 안 하기로 했나 (취소) | 캡틴이 내린 **결정** | `spec.md` 의 명시적 선언 |

캡틴 말씀: 취소는 일이 진행돼서 생긴 사실이 아니라 캡틴이 "이건 안 한다" 고 선언하신 것이다.
드물고, 오직 캡틴만 내리고, 사유를 함께 남길 자리가 필요하다 — 문서가 그 자리다.

### D2 — 신관례 기능의 머리글 배지는 티켓에서 파생한다

손으로 쓴 `Status:` 줄을 신관례 기능의 배지 출처로 쓰지 않는다.
판정 술어는 **이미 있다**(`hasOpenWork`, `featureFullyChecked`) — 새로 만들지 마라.

🔴 구관례(`issues/`) 기능의 배지는 **지금 그대로** 문서 줄 verbatim 이다.
그쪽은 문서가 SoT 이므로 이 기능이 건드릴 이유가 없다.

### D3 — 명시적 취소가 계산을 이긴다

`spec.md` 가 `wontfix` 를 선언하면 그것이 최종이다 — 관례를 가리지 않는다.
계산은 "지금 얼마나 됐나" 만 답하고, 취소는 그 질문 자체를 닫는다.

### D4 — 취소는 티켓까지 내려간다

기능이 취소되면 그 기능의 **아직 안 끝난** 신관례 티켓은 `dropped` 로 취급한다.
이미 `done` 인 티켓은 `done` 으로 남는다 — 실제로 착지한 일을 없던 일로 만들지 않는다.
이것이 있어야 `hasOpenWork`·`next`·계획판이 취소된 기능을 그만 물어본다.

### D5 — 조인 실패는 여전히 "모른다" 다

백로그에 조인되지 않은 신관례 티켓은 지금처럼 상태 미표시다(`isUnjoinedNewTicket`,
TicketRow.tsx:25). 그 티켓만 있는 기능의 머리글 배지도 **추측하지 않는다** — 안 띄운다.
🔴 조인 실패를 "착수 가능" 이나 "완료" 로 읽는 것은 INV-4 위반이다.

## 범위 밖

- 백로그에 취소 상태를 새로 만드는 것 — `tasks-axi` 가 그 상태를 모르므로 도구 밖 관례가 된다.
- 구관례 기능의 배지 동작 변경 — 문서가 SoT 인 쪽은 지금이 옳다.
- `Status:` 줄 서식 변경 — `parseStatusLine` 과 아홉 값 어휘는 그대로다.

## 참고 — 기능 수준 `feature.status` 는 현재 소비처가 0이다

    grep "feature.status|f.status" frontend/src core/src backend/src (test 제외) -> 0건

계약에는 실려 있지만 아무도 읽지 않는다. 이 기능이 그 칸을 되살릴지 새 칸을 둘지는
구현 티켓이 정한다 — 다만 **화면이 읽는 값과 판정이 읽는 값이 갈라지면 안 된다**(단일 판정 자리).

## 검증

`pnpm -C code/web verify` green + 실물:

1. 신관례 기능 6개의 머리글 배지가 옆 숫자와 모순하지 않는다(완료 기능은 완료로 보인다).
2. `spec.md` 에 `wontfix` 를 선언한 신관례 기능이 `next` 에서 안 나오고 남은 일에서 빠진다.
3. 구관례 기능 배지가 하나도 안 바뀐다.
