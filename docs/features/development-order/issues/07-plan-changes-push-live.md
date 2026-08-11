# 07 — 계획이 바뀌면 다른 화면에도 즉시 밀어 준다

**What to build:** `plan` 탭이 열려 있는 동안, 계획(`ticket_order`·`feature_order`)이 바뀌면
새로고침 없이 자동으로 다시 읽는다. 바뀌는 주체가 **그 탭 자신의 드래그**든, **다른 탭의 드래그**든,
**터미널의 `gootte set`/`drop`(CLI)** 이든 셋 다 같다.

**Blocked by:** [04](04-the-captain-drags-to-change-the-order.md) — 쓰기 경로가 먼저 있어야 한다

**Status:** resolved (2026-08-11)

## 캡틴 지시 (2026-08-11, 원문)

> "db를 수정하면 실시간 반영이 되어야하지 않아? 매번 refresh해야해?"
> "지금 하자. 기능확장해서 문서 작성하고, 지금해."

04를 캡틴이 직접 눈으로 확인하던 중 나온 요구다 — CLI로 `gootte set`을 돌려 계획을 고쳤는데
브라우저 탭이 새로고침 전까지 낡은 값을 그대로 그리고 있었다.

## 지금 서 있는 것 (실측)

- `features` 탭은 이미 실시간이다 — `backend/src/server.ts`가 `watchProjects`(core-io)로
  `docs/features/` 파일 변경을 감시해 WS `/api/live`로 `ChangeEvent`를 쏘고,
  프론트 `useLiveSync`가 그 project의 쿼리를 invalidate한다(2b, ADR-0004 — 은퇴한 워크플로우의 결정이지만
  코드는 살아 있고 계속 쓴다).
- **`plan` 탭은 이 경로에 안 걸린다.** `watchProjects`는 `docs/features/`만 보지 `GOOTTE_DATA_DIR`의
  `plan.db`는 안 본다. 그래서:
  - 브라우저 자신의 드래그(POST) → 그 탭만 자기 mutation 성공 후 스스로 재조회(티켓 04). 다른 탭엔 안 감.
  - CLI(`gootte set`/`drop`) → 서버 프로세스 밖이라 **아무 신호도 안 간다.**

## 무엇이 바뀌나

| 경로 | 지금 | 바뀐 뒤 |
|---|---|---|
| 브라우저 자신의 드래그 | 자기 탭만 재조회 | 그대로 + **다른 탭에도** 즉시 반영 |
| 다른 탭의 드래그 | 반영 안 됨(새로고침 전까지) | 즉시 반영 |
| CLI `gootte set`/`drop` | 반영 안 됨 | 즉시 반영 |

## 설계 — 두 경로를 합친다

🔴 **판정 자리를 늘리지 않는다** — 기존 `ChangeEvent`/`LiveHub`/`useLiveSync`(2b) 를 그대로 쓴다.
새 WS 채널도 새 데몬도 만들지 않는다(spec §명령 의 `ask`/`extra` 침묵 규약과 같은 절약 원칙).

1. **브라우저 드래그(정확한 신호)** — 세 POST 엔드포인트(`ticket-step`·`ticket-step/insert`·`feature-rank`)가
   쓰기에 성공하면 그 자리에서 `hub.broadcast({ kind: "project", project })`를 부른다.
   기존 `ChangeEvent`(`project`/`projects`) 그대로 재사용 — 계약을 안 늘린다.
   프론트 `useLiveSync`는 이미 `kind:"project"`를 받으면 그 project가 낀 쿼리를 전부 invalidate하므로
   (`qk.plan(slug)` = `["plan", slug]`가 project를 포함) **프론트는 손 안 댄다.**
2. **CLI 쓰기(주체를 모르는 신호)** — CLI는 서버 프로세스 밖이라 위 경로를 못 탄다. 대신 서버가
   `GOOTTE_DATA_DIR`의 `plan.db` 파일 변경을 `chokidar`로 지켜본다(`watchProjects`와 같은 도구,
   다른 대상). 어느 프로젝트가 바뀐 건지 파일 변경만으로는 모르므로, **새 coarse kind
   `"plan"`**(project 없음)을 계약에 한 줄 추가하고, 프론트는 그 신호를 받으면
   `queryKey[0] === "plan"`인 쿼리를 전부 invalidate한다(프로젝트를 좁히지 못하니 전부 — `projects`
   kind가 이미 쓰는 것과 같은 "누구인지 모르면 전부"원칙).
3. 두 경로가 겹쳐 쏘일 수 있다(브라우저 드래그도 결국 `plan.db`를 고치니 파일 워처도 반응한다) —
   **문제 없다.** `invalidateQueries`는 멱등이고, TanStack Query가 중복 재요청을 알아서 합친다.

## 완료 조건

- [ ] 탭 A에서 드래그하면 **같은 화면을 연 탭 B**가 새로고침 없이 갱신된다
- [ ] 터미널에서 `gootte set`/`drop`을 돌리면 열려 있는 `plan` 탭이 새로고침 없이 갱신된다
- [ ] `ChangeEvent`에 `project` 없는 새 kind(`"plan"`)가 하나 늘고, 기존 `"project"`/`"projects"`는 안 바뀐다
- [ ] `features` 탭의 기존 실시간 동작(문서 변경 push)이 안 깨진다(회귀 없음)
- [ ] 판정 자리(리시버)는 `useLiveSync` 하나뿐 — 컴포넌트마다 따로 구독하지 않는다
- [ ] 관리대상 문서는 여전히 안 건드린다(INV-2 — 이 티켓은 gootte 자기 DB 파일만 지켜본다)

## 테스트

| 무엇 | 어디 | 첫 커버인가 |
|---|---|---|
| POST 세 경로가 성공 시 `hub.broadcast`를 정확히 한 번 부른다 | `backend` 단위(hub mock) | 🔴 예 |
| `plan.db` 파일 변경 → coarse `"plan"` 이벤트 방송 | `core-io` 단위(임시 디렉토리, chokidar) | 🔴 예 |
| 프론트 `useLiveSync` — `"plan"` 수신 시 plan 쿼리 전부 invalidate, 그 외 쿼리는 안 건드림 | `frontend` 컴포넌트 | 🔴 예 |
| 기존 `"project"`/`"projects"` 수신 동작 | `frontend` — 이미 있음(`live.test.tsx`) | 🟢 회귀만 확인 |

## 이 티켓이 하지 않는 것

- **누가 바꿨는지 표시** — "누구의 드래그였다"는 안 싣는다. `history.md`가 그 기록을 이미 갖는다(01).
- **충돌 해소·낙관적 잠금** — 동시에 같은 줄을 두 사람이 고치는 경우의 병합 규칙은 별건이다.
- **CLI → 어느 프로젝트인지 정확히 짚기** — 파일 워처는 project를 모른다. 전체 무효화로 충분하다고
  본다(계획 데이터는 가벼워 재조회 비용이 작다). 나중에 필요해지면 새 티켓.
