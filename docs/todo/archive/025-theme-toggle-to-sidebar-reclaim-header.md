---
status: done
priority: normal
initiative: null
area: [web/frontend]
source: user-report
related: [../roadmap/project-manager/web-dashboard/spec.md]
created: 2026-07-27
completedAt: 2026-07-27
---

# theme 토글을 사이드바 하단으로 · 상단 공간은 본문 header 가 차지

> 사용자 보고 (2026-07-27) — UI 를 살짝 손보자. 헤더에 있는 theme 토글 버튼은 좌측 사이드바 아래쪽에 두자. 그리고 그 공간에 본문 header 가 차지하게 하자.

## 의도 (추정)
- 현재 최상단 전역 `<header>`(gootte 로고/타이틀 + 우측 ThemeToggle)가 전체 폭을 먹고, 그 아래에 [Sidebar | MainPanel] + MainPanel 자체 `<header>` 가 있어 헤더가 이중.
- theme 토글을 **좌측 사이드바 하단**(현재 "자동 발견 · N개" 푸터 근처)으로 이동.
- 전역 top 바를 제거/흡수 → **본문(MainPanel) header 가 상단 공간을 차지**(이중 헤더 → 단일). gootte 브랜딩(로고/타이틀)은 사이드바 상단 "PROJECTS" 영역으로 옮기거나 본문 header 에 통합(구현 시 판단).

## 다음 단계 결정 필요
- gootte 로고/타이틀 귀속: 사이드바 최상단 vs 본문 header 좌측 — 구현 시 시안 택1.

## 관련 파일
- `code/web/frontend/src/App.tsx` — 전역 `<header>` 제거/재배치, 셸 레이아웃.
- `code/web/frontend/src/components/sidebar/Sidebar.tsx` — 하단 푸터에 ThemeToggle 배치.
- `code/web/frontend/src/components/main/MainPanel.tsx` — 자체 `<header>` 가 상단 차지.
- `code/web/frontend/src/theme/ThemeToggle.tsx` — 이동(스타일 사이드바 하단 톤 맞춤).

## acceptance
- 전역 top 바 없어지고 본문 header 가 상단 라인 차지(이중 헤더 해소).
- ThemeToggle 이 사이드바 하단에 위치, light/dark 토글 정상 동작.
- 기존 테스트(sidebar/theme) green + 필요 시 배치 변경 반영.
- tsc + vitest green. 320/768/1024/1440 반응형 overflow 없음.
