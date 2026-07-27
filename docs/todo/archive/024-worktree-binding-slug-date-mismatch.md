---
status: done
priority: high
initiative: null
area: [web/core]
source: user-report
related: [../roadmap/project-manager/web-dashboard/spec.md]
created: 2026-07-27
completedAt: 2026-07-27
---

# worktree↔initiative 바인딩 slug 날짜접두사 불일치 (활성 worktree 대시보드 미표시)

> 사용자 보고 (2026-07-27) — jinwooauto 에서 worktree 로 작업 중인데 대시보드에 실시간 반영이 안 됨.

## 증상
- jinwooauto 에 활성 git worktree `sfu-int-safety-authoring` 존재, sprint doc(`docs/sprint/2026-07-27-sfu-int-safety-authoring.md`)이 main 에 커밋됨(`status: in_progress`, `worktree: sfu-int-safety-authoring`).
- 그런데 `GET /api/worktree/jinwooauto` → `{"worktrees":[]}` (빈 값). board `active` 컬럼도 비어 있음.
- WS 실시간 경로(파일변경→watcher→`/api/live` push→쿼리 invalidate)는 **정상 동작 확인됨** — worktree/main 문서 touch 시 `{"kind":"project","project":"jinwooauto"}` 브로드캐스트 정상. 즉 "실시간"이 아니라 **worktree 가 애초에 바인딩 안 돼 패널이 항상 빔**.

## 근본 원인 (확정 — loadProjectState 라이브 재현)
`code/web/core/src/state/build.ts` 의 worktree→initiative 바인딩(라인 32~45):
```
worktree.slug → sprint(s.slug===wt.slug || s.worktree===wt.slug)
             → sprint.todos.includes(t.slug)   ← 여기서 실패
             → effInitiative(t) → wtByInitiative.set(init, wt)
```
- `t.slug` = **파일명 유래**(`parseTodo`, load.ts `readMd`) = `2026-07-27-sfu-int-1-safety-contract` (**날짜 접두사 有**)
- `sprint.todos` = frontmatter 값 = `["sfu-int-1-safety-contract", "sfu-int-2-safety-authoring-ui"]` (**날짜 없음**)
- `sprint.todos.includes(t.slug)` → **false** → 어떤 todo 도 매칭 못 함 → `wtByInitiative` 안 채워짐 → `state.initiatives[].worktree = null` → `worktreeStatuses()`(app.ts:48) 빈 배열.
- `studio-fsm-unify` 는 ledger initiative 로 존재(매칭만 됐으면 바인딩됐을 것). 라이브 probe 결과: `bound worktrees: []`.
- 구조적 문제 — cling 규약상 **cross-ref(sprint.todos, todo frontmatter `sprint:`)는 날짜 없는 slug**, **파일 identity 는 날짜 접두사**가 공존. gootte 가 이 둘을 브리지하지 못함. 과거 sprint(`node-catalog-implement` 등)도 동일 패턴 → 이 바인딩은 조용히 계속 실패해 온 것으로 보임(메모리의 "대시보드가 활성 worktree 못 봄" 재발 건과 동일 뿌리).

## 제안 수정 (gootte 쪽 — 데이터 규약 존중)
- `build.ts` 매칭을 날짜 접두사에 무관하게: 비교 전 `^\d{4}-\d{2}-\d{2}-` 를 양쪽에서 strip 하는 normalize 헬퍼 도입 후 `sprint.todos` ↔ `t.slug` 비교.
  - `norm(s) = s.replace(/^\d{4}-\d{2}-\d{2}-/, "")` → `norm("2026-07-27-sfu-int-1-safety-contract") === "sfu-int-1-safety-contract"`.
  - 날짜 없는 slug/날짜 있는 slug 양방향 모두 안전(strip 무해).
- 같은 identity-vs-reference 불일치가 다른 소비처에도 있는지 확인: todo frontmatter `sprint:`(날짜 없는 sprint ref) ↔ sprint 파일 slug(날짜 有), `initiative` 매칭 경로 등. 필요 시 normalize 를 공용 유틸로.

## acceptance
- vitest — build.ts 바인딩 유닛: sprint.todos(undated) + 파일유래 todo.slug(dated) 조합에서 `initiatives[].worktree` 가 채워짐. undated/undated·dated/dated 회귀도.
- dev 실검증: `GET /api/worktree/jinwooauto` 가 `sfu-int-safety-authoring` 를 반환, board `active` 컬럼에 해당 initiative 표시.
- tsc + vitest green.

## 관련
- 뷰 위반 = **INV-3**(뷰는 항상 현재 SoT 반영 — 활성 worktree 미표시는 stale 뷰).
- 재현/조사 세션: `code/web/core/src/state/build.ts`, `code/web/core-io/src/load.ts`(readMd/parseTodo), `code/web/backend/src/app.ts`(worktreeStatuses).
