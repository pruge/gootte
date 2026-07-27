---
created: 2026-07-27
status: done
completedAt: 2026-07-27
priority: high
sprint: null
initiative: null          # gootte = blueprint 스타일(ledger 미선언) → related 로 연결
area: [web/core]
tags: [worktree, binding, dashboard, regression]
related:
  - ../roadmap/project-manager/web-dashboard/spec.md
  - ./archive/024-worktree-binding-slug-date-mismatch.md
source: user-report
---

# 본문 worktree 패널 비어있음 — 사이드바 카운트는 뜨는데 body 미표시 (sprint↔worktree 바인딩 실패)

> 사용자 보고 (2026-07-27) — worktree 작업이 들어가면 좌측 사이드바에 worktree 개수는 실시간으로 뜨는데, 본문에는 안 나온다. gootte 자기 worktree(doc-browser)가 안 잡힘. 서버는 root(GOOTTE_ROOTS=~/Documents)에서 실행 = gootte self-view.

## 의도 (추정)
사이드바 카운트와 본문 패널이 **서로 다른 데이터 경로**라 한쪽만 뜬다:
- **사이드바 카운트** (`p.worktrees`) = `backend/app.ts:89` `scanWorktrees(p.path).length` — 디렉토리 raw 카운트. 바인딩 체인 우회 → 항상 맞음.
- **본문 worktree 패널** = `worktreeStatuses()`(`app.ts:48`)가 `state.initiatives` 중 `i.worktree` 있는 것만 = `buildState`의 `wtByInitiative` 바인딩된 것만. 체인 하나만 끊겨도 카운트>0 이어도 body 는 빈다.

## 근본원인 (두 겹 — 024 후속 재발)
1. **Cause A (운영/재발 3회차)** — 활성 sprint 문서 `docs/sprint/2026-07-27-doc-browser.md` 의 `worktree: null`. `/cling:worktree` 바인딩이 pre-entry 커밋에 안 실렸다 (= `[[sprint-binding-before-pre-entry]]` 그 버그. worktree-panel·web-realtime 에 이어 3번째).
2. **Cause B (코드 갭 — 024 fix 사각)** — `code/web/core/src/state/build.ts:41` sprint↔worktree 매칭 `s.slug === wt.slug || s.worktree === wt.slug` 이 **양쪽 다 `undate()` 미적용**. 024(be65a96)의 `undate()` 는 line 43/45 `sprint.todos`↔`t.slug` 에만 들어갔고 **line 41 sprint-slug 매칭은 빠짐**. → `"2026-07-27-doc-browser" === "doc-browser"` false + `null === "doc-browser"` false → sprint undefined → continue → gootte worktree 영구 미바인딩 → 패널 빈다.

즉 Cause A(worktree:null)로 fallback 이 slug 매칭에 의존하게 되는데, Cause B(line 41 undate 누락)로 slug 매칭마저 날짜접두사 때문에 실패 = 이중 잠금.

## 다음 단계 결정 필요
- **즉시(운영):** sprint 문서에 `worktree: doc-browser` 바인딩 커밋 → Cause A 해소 확인.
- **durable(코드):** `build.ts:41` sprint↔worktree 매칭에 `undate()` 적용 (`undate(s.slug) === undate(wt.slug) || s.worktree === wt.slug`) → `worktree:` 필드 미바인딩이어도 slug 로 복구. 024 fix 가 덮었어야 할 line 41 사각 마감.
- **회귀 테스트:** `plan.test.ts` 에 "worktree:null 인 sprint 도 slug 로 바인딩" 케이스 추가.

## 관련
- 선행 = archive/024 (동일 영역, undate 도입했으나 line 41 누락)
- 메모리 = [[project-worktree-binding-slug-date-mismatch]] · [[sprint-binding-before-pre-entry]]
- 관련 불변식 = INV-3 (뷰=현재 SoT 반영) — 바인딩 실패 = stale/빈 뷰
