---
created: 2026-07-27
status: done
completedAt: 2026-07-27
priority: high
sprint: null
initiative: null          # gootte = blueprint 스타일(ledger 미선언) → related 로 연결
area: [web/core, web/backend]
tags: [worktree, binding, dashboard, doc-drawer, regression]
related:
  - ../roadmap/project-manager/web-dashboard/spec.md
  - ./030-worktree-body-panel-binding.md
source: user-report
---

# 작업중 worktree 의 sprint 문서가 안 열림 (worktreeStatuses.sprint = null)

> 사용자 보고 (2026-07-27) — 030 fix 로 본문에 worktree 는 떴으나, 그 카드의 sprint 문서를 클릭해도 안 열린다.

## 근본원인 (030 Cause A 가 두 번째 코드 경로로 누출)
030 은 `build.ts` 의 worktree→initiative 바인딩만 undate fallback 으로 고쳤다. 하지만 sprint 슬러그를
따로 재도출하는 **두 번째 경로**가 남아 있었다:

- `backend/app.ts:58` `worktreeStatuses()` — `state.sprints.find((s) => s.worktree === i.worktree.slug)`.
  sprint 문서 `worktree: null`(pre-entry 바인딩 커밋 누락) → undefined → `WorktreeStatus.sprint = null`.
- 프론트 `WorktreeCard` — `clickable = wt.sprint !== null` → sprint null 이면 **버튼 disabled** → 문서 안 열림.

즉 030 fix 로 worktree 는 바인딩됐지만 sprint 슬러그 재도출이 `worktree:` 필드에만 의존해 또 실패.
같은 매칭 로직이 두 곳에 갈라져 한쪽만 고친 게 화근.

## 고침 (DRY — 매칭 단일 SoT)
- `core/src/state/build.ts` 에 `sprintForWorktree(sprints, wtSlug)` export (`s.worktree === wtSlug || undate(s.slug) === undate(wtSlug)`) + `undate` export.
- `build.ts`(wtByInitiative)·`app.ts`(worktreeStatuses) 둘 다 이 함수 사용 → 세 번째 갈래 재발 차단.
- 회귀: `plan.test.ts` `sprintForWorktree` describe(① 필드 바인딩 ② worktree:null slug fallback ③ no-match).

## verify
- `pnpm verify` green (tsc + vitest 149/149, plan.test 8→11).

## 관련
- 선행 = 030(같은 Cause A, 첫 코드 경로) · 메모리 [[project-worktree-binding-slug-date-mismatch]] · [[sprint-binding-before-pre-entry]]
