---
status: pending
priority: normal
initiative: null
area: [web/frontend]
source: spec-decompose
related: [../roadmap/project-manager/web-dashboard/spec.md, 010-plan-lineage-views]
created: 2026-07-25
---

# theme 토글 + polish + e2e (T6·T7)

spec T6·T7. [ADR-0004](../roadmap/project-manager/web-dashboard/adr/0004-theme-design-direction.md).

- **T6** theme 토글(system/dark/light 순환, localStorage) + 디자인 polish — **다크 미션컨트롤 / 라이트 에디토리얼 둘 다 의도적**(anti-template). CSS 토큰(색·간격·타이포), Tabler 전용, Pretendard 본문·monospace ref.
- **T7** e2e — `pnpm dev`(backend+frontend) → 브라우저에서 jinwooauto plan/lineage 렌더·theme 전환 확인.

**acceptance**:
- **측정(vitest/자동)**: 3-mode(system/dark/light) 순환 토글 · localStorage 지속 · CSS 토큰 적용 · hover/focus 상태 존재.
- **사람 eye-check(비자동)**: 두 테마 다 슬롭 아님(계층·밀도·의도적) — T7 `pnpm dev` jinwooauto 실렌더 시 육안 확인.
**의존**: 010
