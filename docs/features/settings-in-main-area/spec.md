# settings-in-main-area — 설정을 모달 다이얼로그에서 본문 영역(VSCode 스타일)으로 옮긴다

Status: ready-for-agent

## 캡틴 지시 (원문)

> **"현재 설정 창이 dialog로 뜬다. 설정 버튼을 누르면 본문에 설정 창이 보였으면한다. vscode와 같은 형태의 설정창을 디자인하자."**

## 문제

설정은 지금 `SettingsDialog`(모달 오버레이)로 뜬다 — `MainPanel.tsx` 가 gear 버튼을 누르면
`<SettingsDialog open>` 을 `fixed inset-0 z-50` 백드롭 오버레이로 렌더한다. 사용자는 그 오버레이
위에서만 설정을 보고, 화면의 나머지는 흐려져 보이지 않는다. 설정 항목이 늘어나면(테마·알림…)
좁은 다이얼로그 안에서 감당하기 어려워진다.

설정을 **본문(main) 영역**에 둔다 — 평소 features/plan/steps 가 그려지는 자리에 설정 화면이
대신 그려진다. 본보기는 **VS Code 설정**(상단 검색 + 좌측 카테고리 트리 + 우측 폼)이다.

## Goal

- gear 를 누르면 본문 영역에 **VSCode 스타일 설정 화면**이 그려진다(오버레이가 아니라 화면 교체).
- 설정은 **전역 하나**다 — 프로젝트별 설정이 아니라, 어느 프로젝트를 골라도 같은 설정 화면이 열린다.
- 본문 헤더 타이틀이 설정 열림/닫힘에 따라 바뀐다 — 열면 `Settings`, 닫으면 선택한 프로젝트명.
- 설정 행은 VSCode 배치를 따른다 — **제목 → 다음 줄 설명 → 다음 줄 입력란**(세로 스택).
- 기존 설정 항목(firstmate 홈 · 감시 폴더 · 차단 목록)을 그대로 옮기고, 늘어날 항목을 카테고리로 정리한다.

## 설계 결정 (lavish 프로토타입에서 확정 — A 안, VSCode 본보기)

- **A 안(VSCode) 확정.** 세 안(좌측 카테고리+검색 / 아이콘 레일 / 중앙 단일 컬럼)을 gootte 실제
  chrome 위에 놓고 비교했고, 항목이 이미 3개고 성격(경로 입력 · 목록 편집 · 목록 해제)이 갈리는
  지금 상태에서 검색 + 카테고리 트리가 확장에도 버티므로 A 안을 택했다.
- **레이아웃** — 좌측 레일: 상단 검색창 + 카테고리 목록(일반 · 감시 · 숨김 + 예정: 테마). 우측:
  카테고리 헤더(브레드크럼) + 설정 행들.
- **행 배치** — 제목 / 설명 / 입력란 **세로 스택**(VSCode 와 동일). 입력란은 목록형이 아니면
  왼쪽 정렬 + 적당한 폭.
- **라우팅** — gear 를 토글로 쓴다: 한 번 누르면 설정 화면(헤더 타이틀 `Settings`), 다시 누르면
  원래 뷰(프로젝트명). URL 라우트(`?tab=…`)로 확장 가능한 자리를 남긴다.
- **저장 방식 — 현행 유지.** 명시적 "저장" 버튼(dirty 판정 + 성공 표시). 자동저장은 이 기능에서
  결정하지 않는다 — 별도 티켓으로 남긴다.
- **프로젝트 선택과 무관** — 사이드바의 어떤 프로젝트를 골라도 gear 하나로 같은 설정이 열린다.

## Produces

- `frontend` `SettingsView`(본문에 그려지는 컴포넌트) — 검색 + 좌측 카테고리 + 우측 폼.
- `frontend` `MainPanel` — `SettingsDialog` 오버레이 제거, gear 토글로 설정 화면 교체, 헤더
  타이틀 `Settings`/프로젝트명 전환.
- `frontend` `SettingsDialog` 제거(역할이 `SettingsView` 로 대체).
- `frontend/test` — `settings-dialog.test.tsx` → `settings-view.test.tsx` 로 이전·확장.

## Consumers

- `code/web/frontend/src/components/main/MainPanel.tsx` — gear 토글 + 화면 교체 + 헤더 타이틀
- `code/web/frontend/src/components/settings/SettingsDialog.tsx` → `SettingsView.tsx`
- `code/web/frontend/test/settings-dialog.test.tsx` → `settings-view.test.tsx`
- 백엔드·contract 는 건드리지 않는다 — 이 기능은 순수 프론트 배치 변경이다(INV-2: 관리대상 문서
  무접촉 유지, INV-5: 저장 정책은 그대로 settings.json).

## Out of scope

- 자동저장(디바운스) 전환 — 별도 결정
- 예정 카테고리(테마 등)의 실제 구현 — 배치 시연만
- URL 라우트(`?tab=settings`) 실현 — 자리만 남김
- 백엔드/contract 변경 없음
