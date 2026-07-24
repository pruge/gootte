# ADR-0004: theme 3-mode + 디자인 방향 (anti-template)

Status: accepted
Date: 2026-07-25 / 관련: spec.md, wireframe.md

## Context
UI 디자인 — shadcn 기본 슬롭 금지(anti-template). 테마 요구 = system/dark/light 3-mode.

## Decision
- **theme 3-mode** — `prefers-color-scheme` 기본 + 수동 토글(system/dark/light). Tailwind `dark:` + root `data-theme`. localStorage 지속.
- **디자인 방향 — 둘 다 의도적**:
  - **dark = "미션 컨트롤"** — 상시 띄우는 dev 콘솔. 밀도 높되 계층 명확. ref/ADR/SHA=monospace, 상태=Tabler 아이콘 + 단일 accent(NOW 강조).
  - **light = 에디토리얼** — 고대비 타이포 계층, lineage 산문 읽기 좋음.
- **폰트** Pretendard(본문 — 한글 dense) + monospace(ref/코드). **아이콘 Tabler 전용**(프로파일 하드룰). CSS 토큰(색·간격·타이포)으로 palette 정의(하드코딩 X).
- 밀도·계층·상태색(semantic)·hover/focus 의도적 — 기본 카드 그리드 슬롭 금지.

## Alternatives
- 다크 단독 → 라이트 사용자·가독 상실 + 규칙(다크 자동 금지) 위배. 3-mode.
- shadcn 기본 → template 슬롭. 기각.

## Consequences
- (+) 두 테마 다 의도적 = 상시-띄움(dark)·정독(light) 둘 다 커버.
- (−) 두 테마 유지비(토큰으로 완화).

## Invariant impact
없음.

## Contract impact
없음.
