---
created: 2026-07-25
status: done
priority: high
kind: single
todos: [008-backend-api]
worktree: backend-api
startedAt: 2026-07-25
endedAt: 2026-07-25
related_sprints: []
---

# backend-api — Hono API seam (CORE projections → JSON)
> 단독. 1 worktree = 1 sprint. web-dashboard 2a 파이프라인 dep 루트.

## scope
- 008-backend-api (high) — Hono + `@hono/zod-validator`로 `/api/{projects,plan,lineage}` 서빙. CONTRACT envelope 신규.

## 🔴 Invariant 점검
- **INV-2** 읽기 전용 — backend는 core-io `loadProjectState`(read)·discover만. 관리대상 문서 write 절대 X.
- **INV-4** read-path 결정적·LLM-free — backend는 CORE 릴레이(서버 LLM 0). envelope는 CORE 산출을 zod 검증 후 verbatim 전달.
- **INV-3** 항상 현재 반영 — plan/lineage는 매 요청 `loadProjectState` 재계산. discover만 캐시(TTL 5s, 프로젝트 목록은 자주 안 변함).

## 작업 path (예상 phase)
### Phase 1 — CONTRACT envelope (선행, B1)
- `@gootte/contract`에 `ProjectsResponse`·`PlanResponse`·`LineageResponse`·`ApiError` 이미 정의됨(kickoff-review 반영) → codegen 재실행 + drift-guard diff 0 확인.

### Phase 2 — Hono 서버 스캐폴드
- `code/web/backend/` 패키지(`@gootte/backend`) — `hono`·`@hono/node-server`·`@hono/zod-validator` + `@gootte/core`·`core-io` 의존.
- 앱 부팅 + `@hono/node-server` 로컬 실행 엔트리.

### Phase 3 — 라우트
- `GET /api/projects` → discover(env `GOOTTE_ROOTS`, 기본 `~/Documents`) → `ProjectsResponse`.
- `GET /api/plan/:slug` → slug→path 해소 → `loadProjectState`→`buildPlan` → `PlanResponse`.
- `GET /api/lineage/:slug` → state.supersessions/drops → `LineageResponse`.
- slug 미해소 = 404 `ApiError`. 응답 = zod 검증 후 반환.

### Phase 4 — discover 캐시 + slug 충돌
- discover 결과 프로세스 메모리 캐시(TTL 5s). slug=basename 충돌 시 first-match + `console.warn`.

### Phase 5 — 정적 서빙 (프로덕션)
- 빌드된 frontend 정적 서빙(2a 프로덕션 단일 서버). frontend 미존재 단계면 stub/no-op 가드.

## 다음 단계 결정 필요
- 없음(spec 이 닫음). 단 `code/web/backend/` 첫 코드 생성 후 **init 재실행**으로 backend verify 확정(`tsc --noEmit`+`vitest`) + `## Ports`/`## Worktree bootstrap`/`pnpm dev` 배정은 `/cling:ops` 재실행(구현 중 dev 서버 생길 때).

## 완료 기준
- 008 완료: `app.request('/api/projects')`·`/api/plan/:slug`·`/api/lineage/:slug` vitest green — envelope zod 검증(CONTRACT), 404 `ApiError`, slug 충돌 경고, discover 캐시 재사용.
- 전체 회귀: `pnpm verify`(tsc + vitest, contract drift-guard diff 0) green. jinwooauto 실데이터로 3 라우트 200 응답 + plan/lineage 내용이 `pnpm plan`/`pnpm lineage` CLI 출력과 일치(같은 CORE 릴레이).

## 사용자 테스트
> sprint backend-api 완료 기준 — worktree 안 검토용. (자동 게이트 `pnpm verify` = 제가 머지 전 실행, green 32/32.)

🌐 Backend dev (user-runs)
```
GOOTTE_ROOTS=$HOME/Documents/ai PORT=8788 pnpm -C code/web/backend start
```

✅ 테스트 (다른 터미널에서 curl)
- `curl -s localhost:8788/api/projects` → jinwooauto 포함 9개 목록
- `curl -s localhost:8788/api/plan/jinwooauto` → plan 15 + rationale(왜)
- `curl -s localhost:8788/api/lineage/jinwooauto` → edges 65 + drops 40 (verbatim)
- `curl -s localhost:8788/api/plan/none` → 404 `{error}`
- 브라우저 `localhost:8788/` → "frontend 미빌드" 스텁(2a T2+에서 교체)

## 관련 todo / spec
- [008-backend-api](../todo/008-backend-api.md) — Hono API (T1)
- [spec](../roadmap/project-manager/web-dashboard/spec.md) · [ADR-0002](../roadmap/project-manager/web-dashboard/adr/0002-hono-zod-api.md) · [M-0002](../mermaid/INDEX.md#M-0002)
