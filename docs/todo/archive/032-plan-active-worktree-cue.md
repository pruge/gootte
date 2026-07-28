---
status: done
priority: normal
completedAt: 2026-07-29
initiative: null
area: [web/frontend]
source: user-report
related: [../roadmap/project-manager/web-dashboard/spec.md]
created: 2026-07-29
---

# 플랜 리스트 작업중 worktree 시각 신호 — 진행바 파랑 + "작업중" 레이블

> 사용자 보고 (2026-07-29) — 플랜 리스트에서 현재 작업중인 worktree가 있으면 progressbar 색상을 파랑계열로 변경하자. 그리고 진행 -> 작업중 이라고 변경하자.

## 의도 (추정)
- 활성 worktree(= `item.status === "active"`)인 roadmap 항목을 한눈에 구분 — 진행바 fill 을 accent 대신 **파랑 계열**로.
- `active` 상태 레이블 "진행" → **"작업중"** (worktree 가 지금 돌고 있음을 명확히). BoardView/RoadmapPanel 이미 "작업중" 어휘 사용 → 용어 통일.

## 다음 단계 결정 필요
- **파랑 = semantic 인지 확인** — 현재 진행바는 `bg-accent/10`(테마 accent). 활성만 파랑으로 바꾸면 accent 규율과 충돌 여부(테마 토큰에 blue 계열 추가 vs Tailwind `bg-blue-500/10` 하드). Tailwind 하드룰 준수 하되 다크/라이트 양쪽 대비 확인.
- **"진행" 범위** — 이 todo 대상은 `RoadmapItemRow` 의 `active.label`("진행" → "작업중"). `RoadmapPanel` 탭 레이블("진행")도 함께 바꿀지는 구현 시 확인(탭은 이니셔티브 진행/완료 축이라 별 의미일 수 있음).

## 관련
- `code/web/frontend/src/components/plan/RoadmapItemRow.tsx` — L16 `active: { label: "진행", … tone: "text-accent" }` (레이블) · L49–55 진행바 fill `bg-accent/10` (파랑 대상, `item.status` 분기 필요).
- `code/web/frontend/src/components/plan/RoadmapPanel.tsx` — L37 탭 `{ key: "wip", label: "진행" }` (범위 결정 대상).
- 스택 하드룰: CSS=Tailwind · icon=Tabler · 진행바=파생(INV-4, done 비율).

## 비고
- 단일 파일·한 세션 규모 → worktree 불요. `/cling:todo start 032-plan-active-worktree-cue` → 구현 → `/cling:todo ship 032-plan-active-worktree-cue`(verify `tsc --noEmit` + vitest) 경로 권장.
