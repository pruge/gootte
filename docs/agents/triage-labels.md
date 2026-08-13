# Triage labels — 정규 `Status:` 아홉 값

스킬들은 다섯 개의 정규 triage 역할로 말한다. 거기에 이 저장소가 실제로 필요로 하는 넷
(`draft` · `blocked` · `claimed` · `resolved`)을 더해 **아홉 개를 정규 `Status:` 값**으로 삼는다.
자매 저장소(jinwooauto)와 같은 아홉 값이다 — 저장소를 오가는 작업자가 어휘를 다시 배우지 않게 한다.

| Status 값 | 출처 | 뜻 |
|---|---|---|
| `draft` | 저장소 추가 | 아직 트리아지 대상이 아님 — 쓰는 중, 범위 미확정 |
| `needs-triage` | mattpocock/skills | 메인테이너가 평가해야 하는 이슈 |
| `needs-info` | mattpocock/skills | 보고자의 추가 정보를 기다리는 중 |
| `ready-for-agent` | mattpocock/skills | 완전히 명세됨, AFK 에이전트가 집어갈 수 있음 |
| `ready-for-human` | mattpocock/skills | 사람의 구현이 필요 |
| `blocked` | 저장소 추가 | 착수 가능했지만 외부 요인으로 대기 — 아래 "`blocked` vs `Blocked by:`" 참고 |
| `claimed` | 저장소 추가(자매 저장소의 조사용 티켓과 같은 이름) | 누군가 이 티켓을 집어갔다(임자 있음). 이 값 자체로는 화면을 처리중으로 만들지 않는다 — 아래 "시작 전이 규칙" 참고 |
| `resolved` | 저장소 추가 | 완료. **`(YYYY-MM-DD HH:MM)` 완료 시각까지 반드시 동반**(§서식). `done` 은 동의어 오용 — 새로 쓰지 않는다 |
| `wontfix` | mattpocock/skills | 처리하지 않음 |

일반적인 흐름: `draft → needs-triage → (needs-info ⇄ needs-triage) → ready-for-agent`/`ready-for-human`
`→ claimed → (blocked ⇄ 해제) → resolved`, 또는 언제든 `wontfix` 로 종결.

스킬이 역할을 언급하면(예: "apply the AFK-ready triage label") 이 표의 대응 문자열을 그대로 쓴다.

## 이 저장소에서의 적용 형태

트래커가 GitHub 이 아니라 `docs/features/` 아래 마크다운이다([`issue-tracker.md`](issue-tracker.md)).
따라서 **라벨은 붙이는 것이 아니라 파일에 쓰는 것**이다 — 각 파일 상단의 `Status:` 줄에 위 문자열을 그대로 적는다.

```markdown
# 03 — 포트를 firstmate 방식으로

**Blocked by:** 01
**Status:** ready-for-agent
```

상태 전이는 그 줄을 고쳐 쓰는 것이고, 그 사유는 파일 하단 `## Comments` 에 append 한다.

## 🔴 서식 — `Status:` 줄은 한 줄로 끝난다

`**Status:** <값>[ (짧은 사유 또는 날짜)]` — **값 하나 + 괄호 속 한 줄까지.**

- 🔴 `resolved` 는 **완료 시각까지** 반드시 붙인다: `resolved (2026-08-13 14:05)`.
  서식은 **`YYYY-MM-DD HH:MM`** (캡틴 결정 2026-08-12, 이 저장소 재설계 중 — `plan-board` 06 이 착지해
  계획 화면이 완료 시각을 **분까지** 읽는다). 하루에 여러 건이 닫히면 날짜만으로는 순서를 못 읽는다.
  🟢 날짜만 적힌 옛 문서는 **그대로 유효하다.** 소급해 고치지 말고, 없는 시각을 `00:00` 으로
  지어내지도 마라 — 읽는 쪽이 날짜만 있는 줄을 그대로 처리한다.
  🔴 **다른 값의 괄호에 든 날짜는 완료일이 아니다**(`ready-for-agent (2026-08-13)` 등) —
  시각을 요구하지 않는다. 시각 의무는 `resolved` 하나뿐이다.
- `blocked` 은 사유를 짧게 붙인다: `blocked — 02 착지 후`.
- 설명이 길어지면(근거, 대안 검토, 진행 서술) `Status:` 줄에 이어 쓰지 말고 파일 하단 `## Comments` 에
  적고, `Status:` 줄에서는 `## Comments 참고` 정도로 짧게 가리킨다.

이 서식을 지키는 이유는 하나다 — 파일을 열지 않고 `grep -rn 'Status:' docs/features` 한 번으로
전체 트리아지 상태를 훑을 수 있어야 하기 때문이다. 줄이 길어지는 순간 그 grep 이 못 쓰게 된다.

## 시작 전이 규칙 — 작업자가 착수할 때

작업자는 **가지를 만든 직후 첫 행동**으로 맡은 티켓(들)의 `Status:` 줄을 `claimed` 로 바꾸고
**그것만 담은 커밋**을 만든다. 티켓 여러 장을 한 작업자가 맡으면 시작할 때 전부 표시한다.
티켓이 없는 일(정찰·조사)에는 해당하지 않는다.

완료 전이 규칙은 그대로다 — 구현 커밋이 같은 줄을 `resolved (YYYY-MM-DD)` 로 뒤집는다
([`issue-tracker.md`](issue-tracker.md) §상태 전이는 구현 변경의 일부다). 두 규칙은 **서로 다른
시점**을 가리킨다 — `claimed` 는 착수할 때, `resolved` 는 끝날 때.

🔴 `claimed` 라고 적힌 것만으로 화면이 처리중이 되지 않는다. 처리중은 살아 있는 격리 사본이
그 티켓을 지금 붙들고 있을 때만 만들어진다 — 문서는 "무슨 일인가" 만 말하고, "누가 지금 하나" 는
관측이 답한다. 머지됐는데 `resolved` 로 안 바뀐 `claimed` 흔적은 화면이 감추지 않고 따로 드러낸다.

## `blocked` vs `Blocked by:`

두 필드는 다른 것을 가리킨다 — 섞어 쓰지 않는다.

- **`Blocked by: 01, 02`** — 같은 기능 안의 티켓 번호에 대한 구조적 의존. 나열된 티켓이 전부 `resolved`
  되면 **기계적으로 해제**된다.
- **`Status: blocked`** — 번호로 특정할 수 없는 외부 대기(다른 기능의 착지, 캡틴 결정, 상류 릴리스 등).
  `Blocked by:` 로 표현이 안 될 때만 쓴다.

같은 티켓이 둘 다 가질 수 있다(예: `Blocked by: 02` 이면서 `Status: blocked — 자매 사양 01 착지 대기`).

## `spec.md` 의 `Status:` — 같은 여덟 값, 진행률은 `## Progress` 로

`docs/features/<기능>/spec.md` 의 `Status:` 줄도 이 여덟 값 중 **정확히 하나**만 갖는다(대개
`draft`/`needs-triage`/`ready-for-agent`/`ready-for-human`) — 그 기능의 명세 자체가 착수 가능한
상태인지를 가리킨다.

**진행률 서술**(어떤 티켓이 끝났는지, 어디까지 착지했는지)은 `Status:` 줄에 넣지 않고 spec.md 본문에
`## Progress` 절을 만들어 그리로 옮긴다.

## ADR 의 `Status:` — 별개 어휘, 섞지 않는다

`docs/features/<기능>/adr/NNNN-*.md` 의 `Status:` 는 위 여덟 값이 아니라 표준 ADR 생애주기 네 값을 쓴다:
`proposed` · `accepted` · `rejected` · `superseded`. ADR 은 "누가 다음에 할지" 가 아니라 결정 기록이라
다른 질문에 답하기 때문이다. 기존 결정을 뒤집을 때는 옛 ADR 을 고치는 대신
**새 ADR 을 쓰고 무엇을 뒤집는지 적는다**([`issue-tracker.md`](issue-tracker.md)).

## ⚠️ 제품이 다루는 상태 어휘와 혼동하지 않는다

이 저장소가 만드는 제품은 **관리대상 프로젝트의** 상태 어휘를 따로 갖는다 — 예를 들어
`TodoStatus`(`pending` `in_sprint` `in_progress` `done` `dropped`)와 `InitiativeStatus` 는
`code/web/contract/src/index.ts` 에 zod 로 정의돼 있다. 그것은 **관리대상 문서를 파싱한 결과의 어휘**이지
이 저장소 자신의 티켓 어휘가 아니다. 여기 아홉 값과 서로 번역하거나 통일하려 들지 않는다.
🔴 `claimed` 를 `in_progress` 로 적지 않는다 — `in_progress` 는 제품 어휘의 이름이고, 문서가 그
이름을 쓰면 "문서가 진행중이라 했으니 진행중" 이라는 오독이 곧바로 따라온다.
