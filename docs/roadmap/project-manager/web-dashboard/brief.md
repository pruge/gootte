# brief — web-dashboard (project-manager · phase 2a 웹 셸)

> blueprint 종속. 전체·seam·불변식 = [../blueprint.md](../blueprint.md). **blueprint phase 2를 2a/2b/2c로 분할한 첫 슬라이스.**

## 이 phase (2a)
**웹 셸** — Hono backend가 CORE projections를 JSON 서빙 + React가 read-only 렌더(프로젝트 목록 → plan/lineage). **CORE→HTTP→React 파이프라인 증명.** localhost·no-auth·poll.

## blueprint 에서 소비 (재정의 X)
- phase 1 엔진 전부: `loadProjectState`→state→`buildPlan`/lineage. CONTRACT 타입 end-to-end. INV-1/2/3/4. M-0001.
- **웹은 계산 0 — 서빙 + 렌더만.**

## 확정 스택
- **backend** Hono + `@hono/zod-validator` (CONTRACT zod로 검증 서빙)
- **frontend** React + Vite + Tailwind + Tabler + Pretendard + **TanStack Query**(서버상태) + URL state(네비) + theme context
- **theme** system/dark/light 3-mode (`prefers-color-scheme` + 수동 토글, 둘 다 의도적)
- **Zustand 보류** (서버상태 복제 = INV-1 위배; 클라 상태 커지는 2b+에서)

## non-goal (2a)
- **WS/watcher 실시간**(2b) · **.env auth**(2b) · **CF 터널**(3차) · **칸반·Gantt·supersede 시각 그래프**(2c) · Android(3차).
- 2a는 plan/lineage를 **리스트/텍스트-강화 뷰**로(순서·할일·근거·supersede 체인·drop). 리치 시각화 X.

## reuse map
CORE projections(plan·rationale·lineage) = 데이터소스 그대로. CONTRACT 타입 = API req/resp SoT. 새 계산 로직 0.

## future (blueprint phase 2 나머지)
- **2b** WS backend + watcher(즉시 file-watch) + .env 로그인 (실시간·인증)
- **2c** 칸반 · Gantt(시간축) · supersede 시각 그래프 · worktree상태 · 테스트할것
- **3차** CF 터널 + Android

## ADR 색인
- **ADR-0001** 2a scope — 웹 셸(서빙+렌더), WS/auth/richviz는 2b/2c
- **ADR-0002** Hono + zod-validator API seam — CONTRACT 타입 end-to-end
- **ADR-0003** 상태관리 — TanStack Query(서버) + URL state(네비) + theme context, Zustand 보류
- **ADR-0004** theme 3-mode + 디자인 방향(다크 미션컨트롤 / 라이트 에디토리얼, anti-template)
