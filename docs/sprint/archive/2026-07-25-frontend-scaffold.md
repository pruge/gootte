---
created: 2026-07-25
status: done
priority: high
kind: single
todos: [009-frontend-scaffold]
worktree: frontend-scaffold
startedAt: 2026-07-25
endedAt: 2026-07-25
related_sprints: [2026-07-25-backend-api]
---

# frontend-scaffold — Vite+React 셸 + 사이드바/라우팅 (T2·T3)
> 단독. 1 worktree = 1 sprint. 008 API 위에 프론트 foundation. 뷰(010)가 얹힘.

## scope
- 009-frontend-scaffold (high) — `code/web/frontend/` 스캐폴드(T2) + 사이드바·URL 라우팅(T3). 뷰 본체는 010.

## 🔴 Invariant 점검
- **INV-1** projection 파생 — 서버상태는 **TanStack Query 캐시만**(2차 SoT 복제 X). **Zustand 미사용**(ADR-0003). 네비 상태만 URL(`?p=&tab=`).
- **INV-4** verbatim — 뷰는 API(CORE 릴레이) 데이터를 렌더만, 프론트에서 재계산/요약 X. (본격 렌더는 010, 여기선 셸.)

## 작업 path (예상 phase)
### Phase 1 — 스캐폴드 (T2)
- `code/web/frontend/` 패키지(`@gootte/frontend`) — Vite + React + `@vitejs/plugin-react` + TS. workspace 추가.
- Tailwind 설정(CSS 토큰 스캐폴드) · Tabler(`@tabler/icons-react`) · Pretendard 웹폰트 로드.
- **TanStack Query** provider 부팅 + `@gootte/contract` 타입으로 API 클라이언트(fetch → zod parse).
- **theme 3-mode** context(system/dark/light, localStorage) — 토큰 스위칭 골격(polish는 011).

### Phase 2 — 사이드바 + 라우팅 (T3)
- 사이드바: `GET /api/projects`(TanStack Query) → 프로젝트 목록(Tabler 아이콘). 선택 = `?p=<slug>`.
- **URL state**: 경량 `URLSearchParams`+훅(`?p=<slug>&tab=plan|lineage`) — react-router 불요(N1). 탭 전환.
- 메인 패널 = 플레이스홀더(plan/lineage 뷰는 010에서 채움).

## 다음 단계 결정 필요
- 없음(spec 이 닫음). frontend dev 서버 생기면 `pnpm dev`(둘 다)·포트 = `/cling:ops`·`/cling:check`(구현 후).

## 완료 기준
- 009 완료: `tsc --noEmit` + `pnpm -C code/web/frontend dev` 부팅 · 사이드바가 `/api/projects`(백엔드 실행 시) → 목록 렌더 · URL `?p=&tab=` 선택/탭 동작 · vitest(사이드바 목록·theme 토글, mock query data).
- 전체 회귀: `pnpm verify`(tsc + vitest, backend 회귀 포함) green.

## 사용자 테스트
> sprint frontend-scaffold 완료 기준 — worktree 안 검토용. (자동 게이트 `pnpm verify` = 제가 머지 전 실행, green 41/41 · vite build 74kb gzip.)

🌐 dev 서버 (user-runs) — `pnpm dev` = backend+frontend 동시
```
GOOTTE_ROOTS=$HOME/Documents/ai pnpm dev
# (개별: pnpm dev:backend · pnpm dev:frontend) → 프론트 localhost:5173, /api → :8787 프록시
```

✅ 테스트 (브라우저 `localhost:5173`)
- 좌측 사이드바에 자동발견 프로젝트 9개(jinwooauto·tuya…) 목록 + Tabler 폴더 아이콘
- 프로젝트 클릭 → URL `?p=jinwooauto`, 우측 헤더에 이름, 선택 항목 강조
- `plan`/`lineage` 탭 전환 → URL `?tab=` 반영 + 개수 표시(plan 15·rationale / edges 65·drops 40) — **뷰 본체는 010**
- 우상단 테마 토글(◐) → system→dark→light 순환(**다크=미션컨트롤 / 라이트=에디토리얼**), 새로고침 후 유지
- 브라우저 뒤로/앞으로 → URL state(선택·탭) 복원

## 관련 todo / spec
- [009-frontend-scaffold](../todo/009-frontend-scaffold.md) — scaffold + 사이드바/라우팅 (T2·T3)
- [spec](../roadmap/project-manager/web-dashboard/spec.md) · [ADR-0003 상태관리](../roadmap/project-manager/web-dashboard/adr/0003-state-management.md) · [ADR-0004 theme](../roadmap/project-manager/web-dashboard/adr/0004-theme-design-direction.md) · [wireframe](../roadmap/project-manager/web-dashboard/wireframe.md) · [M-0002](../mermaid/INDEX.md#M-0002)
