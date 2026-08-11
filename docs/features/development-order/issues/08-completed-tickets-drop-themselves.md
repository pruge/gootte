# 08 — 완료되면 계획에서 스스로 빠진다

**What to build:** 티켓이 관리대상 문서에서 완료(`resolved`/`wontfix`)로 바뀌면, 그 순간
gootte 계획(`ticket_order`)에서 그 티켓 줄이 **자동으로 지워진다.** 사람이 "어긋남"을 보고
`drop`을 눌러줄 필요가 없다.

**Blocked by:** [07](07-plan-changes-push-live.md) — 워처·push 경로가 먼저 있어야 한다

**Status:** resolved (2026-08-11)

## 캡틴 지시 (2026-08-11, 원문)

> "완료 처리하면, 자동으로 인지하잖아. 그럼 자동으로 drop 을 호출하면 되지 않아?"

내가 "버튼으로 사람이 눌러야" 라고 답하자:

> "아니 그렇게하지마, 이건은 작업 계획을 관리하는 것이고, 자동으로 갱신되어야해. 지금 feature가
> 갱신되면 자동으로 화면이 갱신되듯이. 작업자가 문서에 완료처리하면 자동으로 이쪽도 갱신되어야 맞아.
> 네가 쓴다는 개념을 단순히 생각해서 금지시키려고하지마."

## 처음에 잘못 짚은 것 — 바로잡음

"쓰기니까 사람이 눌러야 한다"고 반사적으로 판단했는데, **INV-2(관리대상 읽기 전용)와 무관한
자기 규칙(backend HTTP GET = read-only)을 INV-2와 혼동**한 것이었다. 실제로 지켜야 할 것은:

- 🟢 **관리대상 문서에는 아무것도 안 쓴다**(INV-2) — 이건 그대로 지킨다.
- 🔴 gootte **자기 DB**(`plan.db`)에 쓰는 것은 INV-2 위반이 아니다.

그리고 "자동 갱신"의 진짜 자리는 **HTTP 요청(GET)이 아니라, 이미 떠 있는 문서 워처
(`server.ts`의 `watchProjects` 콜백)** 다. 거기는 이미 부수효과를 갖는 자리다
(`hub.broadcast`, `clearDiscoverCache`) — `features` 탭이 실시간인 것도 바로 그 워처 덕분이다.
그 콜백 안에서 "이 프로젝트 문서가 바뀌었으니, 완료됐는데 계획에 남은 티켓을 지운다"를 하는 것은
`features` 탭 자동 갱신과 **같은 층위**의 반응이지, 요청 경로가 쓰기를 하는 것이 아니다.

## 설계 — 판정 자리를 늘리지 않는다

🔴 "완료됐는데 계획에 남았다"는 판정은 **이미 있다** — `computeMismatches`의 `done_but_staged`.
새 판정 함수를 만들지 않고 그 결과를 그대로 여과해 쓴다(같은 술어, 두 번째 자리 없음).

```
문서 변경(watchProjects) → { kind: "project", project }
                                    ↓
              readFeatures(project) — 방금 바뀐 문서를 다시 읽는다
                                    ↓
     computeMismatches(features, 계획의 ticket_order) 중 done_but_staged 만 골라
                                    ↓
              그 각각에 dropOrder(project, feature, ticket)
                                    ↓
        plan.db 가 바뀜 → 07 의 plan.db 워처가 { kind: "plan" } 을 또 방송(무해 — 멱등)
```

- **서버 시작 시에도 한 번 훑는다** — 서버가 꺼져 있는 동안 문서가 바뀌었을 수 있다(예: 다른 곳에서
  PR 머지). `discoverProjects(roots)` 전체를 대상으로 시작할 때 한 번 정리한다.
- **`feature_order`(기능 자체)는 안 건드린다** — 기능 안의 티켓이 전부 끝나도 그 기능의
  트랙·순위는 남긴다. `done_but_staged`는 티켓 단위 판정이지 기능 단위가 아니다(범위를 안 늘린다).
- **`history.md`는 그대로 `dropOrder`를 재사용**한다 — 자동이든 수동이든 같은 한 줄
  (`drop <project> <feature>/<ticket>`)로 남는다. 누가 언제 지웠는지는 이미 timestamp가 있다.

## 완료 조건

- [ ] 티켓 문서의 `Status:`를 `resolved`로 고치고 저장하면(관리대상 md), **아무 조작 없이**
      그 티켓이 계획(`plan` 탭)에서 사라진다
- [ ] 서버가 켜지는 시점에 이미 완료돼 있는데 계획에 남은 티켓도 한 번 정리된다
- [ ] 완료 안 된 티켓, 그리고 다른 프로젝트의 계획은 안 건드린다
- [ ] `feature_order`(기능 트랙·순위)는 안 건드린다 — 티켓 줄만 지운다
- [ ] 판정은 기존 `computeMismatches`의 `done_but_staged` 하나만 쓴다 — 새 술어를 안 만든다
- [ ] 관리대상 문서는 여전히 안 건드린다(INV-2)
- [ ] `GET /api/plan/:slug`·`GET /api/features/:slug`는 여전히 read-only다 — 이 자동 정리는
      HTTP 요청 경로가 아니라 문서 워처(`server.ts`)에서만 일어난다

## 테스트

| 무엇 | 어디 | 첫 커버인가 |
|---|---|---|
| `done_but_staged`인 것만 골라 `dropOrder`를 부르고, 지운 목록을 돌려준다 | `core-io` 단위 | 🔴 예 |
| 완료 안 된 티켓·다른 프로젝트는 안 건드린다 | `core-io` 단위 | 🔴 예 |
| 문서 워처 콜백이 project 변경 시 정리 함수를 부른다 | `backend` — server.ts 는 단위 테스트 대상이 아니었음(기존 관례), 실측은 실행으로 | 🟡 기존 관례 유지 |

## 이 티켓이 하지 않는 것

- **되돌리기** — 04·07과 같은 이유로 안 만든다. `history.md`가 유일한 기록.
- **기능(feature) 전체 자동 정리** — 기능 안 티켓이 전부 끝나도 `feature_order`는 안 지운다.
- **`wontfix`(dropped)와 `resolved`(done)를 구분해서 다르게 처리** — `doneOrDropped`가 이미
  둘을 같이 본다(next.ts). 여기서도 같은 기준을 그대로 쓴다.
