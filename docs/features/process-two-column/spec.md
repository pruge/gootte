# process-two-column — steps 탭을 2컬럼(1:2)으로 다시 그린다

Status: ready-for-agent

## 캡틴 지시 (원문)

> **"지금 steps(processs)를 ui를 변경해보자. 읽기가 어렵다."**
> **"본문은 2column으로 하자. 1:2로 하자."**
> **"1column에는 feature 목록을 보이자."**
> **"2column에서는 선택된 feature의 tickets 목록을 보이자. 여기서는 완료된것을 숨길필요가 없다."**

## 문제

`process`(steps) 탭은 지금 **단계별 묶음 격자**(`grid-cols-1 → @2xl:2 → @5xl:3`)로 그린다 —
단계 숫자(1단계·2단계·…)가 가로로 늘어서고, 그 안에 기능 다발·티켓 줄이 쌓인다. 단계가
여러 개면 화면이 좌우로 갈라져 **한 눈에 훑기 어렵다**(캡틴: "읽기가 어렵다").

## Goal

본문을 **2컬럼(1:2)** 으로 바꾼다:
- **1컬럼(1/3)**: 작업 대상에 있는 **feature 목록**
- **2컬럼(2/3)**: 선택한 feature 의 **tickets 목록** — **완료된 티켓도 숨기지 않는다**

## 설계 결정

- 레이아웃: `grid-cols-[1fr_2fr]` (1:2). 왼쪽이 feature 목록, 오른쪽이 선택된 feature 의 티켓.
- 왼쪽 컬럼: 작업 대상(`PlanBoardResponse.active`)의 카드에서 feature 슬러그 목록. 클릭하면 선택.
- 오른쪽 컬럼: 선택된 feature 의 모든 티켓(`allTickets` — 구관례 `issues/` + 신관례 `tickets/`)을
  **번호·제목·상자·상태**로 줄 세운다. 완료(`[x]`)·폐기(`[-]`)도 그대로 보인다(숨기지 않는다).
- 선택 상태는 화면 로컬 — URL 이나 계획 DB 에 저장하지 않는다(파생물, INV-1). 기본 선택은
  목록의 첫 feature.
- 단계 드래그(dnd)는 **이 티켓에서 건드리지 않는다** — "읽기가 어렵다" 는 읽기 문제지 순서
  문제가 아니므로, 드래그는 옛 격자에 그대로 남겨 둔다. 이 티켓은 2컬럼 **읽기 화면**만 그린다.
  (드래그를 새 화면으로 옮기는 것은 별개 결정.)

## Produces

- `frontend/src/components/process/ProcessView.tsx` — 2컬럼 레이아웃으로 재작성
  (feature 목록 + 선택된 feature 의 티켓 목록)
- `frontend/test/process.test.tsx` — 2컬럼 동작 테스트(목록 렌더·선택 전환·완료 티켓 표시)

## Out of scope

- 단계 드래그(dnd) 순서 조정을 새 화면으로 옮기기 — 옛 격자에 유지(별개 티켓)
- URL 라우트(`?view=…` 같은 선택 상태 공유) — 로컬 상태
- 서버/계약 변경 — 순수 프론트 배치
