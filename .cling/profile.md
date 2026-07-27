# .cling/profile.md — `gootte` 프로파일

> cling 워크플로우가 읽는 SoT. `/cling:init` 이 생성, 직접 편집 가능.
> 모든 `/cling:*` 명령은 이 파일을 먼저 읽고 프로젝트 특수성을 여기서만 가져온다.

## Project
- name: `gootte`
- summary: cling 프로젝트들을 **프로젝트별로 실시간 관리** — 각 프로젝트 문서 자동 read → 칸반/달력/supersede 그래프(사람) + digest(AI). 핵심 = **연쇄 re-kickoff lineage 가시화**(사람·AI 둘 다 "현재/왜/다음" 파악).

## Components
> verify = 컴파일 + 테스트. **코드 미작성(greenfield) — verify 는 첫 코드 후 init 재실행 시 확정.** 아래는 예상.

| 컴포넌트 | 언어/스택 | build | verify (compile + test) — pending |
|---|---|---|---|
| `web/backend` | TS (Node) | — | `tsc --noEmit` + `vitest`(예상) |
| `web/frontend` | TS · Tailwind · Tabler · Pretendard | — | `tsc --noEmit` + `vitest`(예상) |
| `web/contract` | TS (zod SoT) | — | `contract:check`(codegen rerun + git diff 0) |
| `app` | Kotlin/Android (**추후** 뷰어) | `./gradlew assembleDebug` | `:app:test` + `:app:compileDebugKotlin` |

> **엔진/CLI 배치 미정** — cling-doc 파서 + 상태모델 + `gootte` CLI(agent-skill 용) + digest 생성기. `web/` 아래 `core`(공유 파서)+`cli` 예상. **kickoff 에서 배치 확정.**

## Source layout
- code root: `code/`

| 컴포넌트 | 경로 |
|---|---|
| `web/core` | `code/web/core/` |      # 순수(parse content·state·projections), 부수효과 0
| `web/core-io` | `code/web/core-io/` | # fs read·discover·git·emit (IO 분리, B3)
| `web/cli` | `code/web/cli/` |        # `gootte` CLI + agent-skill
| `web/contract` | `code/web/contract/` |
| `web/backend` | `code/web/backend/` |  # 2차
| `web/frontend` | `code/web/frontend/` | # 2차
| `app` | `code/app/` |                # 3차 Android 뷰어

## Contract (shared SoT)
> 경계 넘는 공유 타입(프로젝트 상태 모델 · digest 스키마 · CLI 출력 · WSS/실시간)을 zod 한 곳에서 정의 → 소비처 파생. **ai/jinwooauto 패턴 참조.**

- mode: `codegen`   # app(Kotlin) 소비 = polyglot → codegen. web-only 라도 schema-first.
- schema tool: `zod` (TS — web-native, 미래 소비처 그대로 import)
- location: `code/web/contract/` (`@gootte/contract`, codegen = `tsx codegen/generate.ts`)
- targets (codegen 산출 — SoT 아님, 손편집 🔴 금지, 헤더 `AUTO-GENERATED — DO NOT EDIT`):
  | 소비 컴포넌트 | 언어 | 생성물 |
  |---|---|---|
  | `app` | Kotlin | `code/app/.../contract/` (추후) |
  | `web/backend`·`web/frontend` | TS | `@gootte/contract` 직접 import |
  | (언어중립) | JSON Schema | `code/web/contract/generated/*.schema.json` |
- drift-guard: `pnpm --filter @gootte/contract codegen` 재실행 → git diff 0. **Verify gate 포함.**
- 실제 패키지 스캐폴드 = `/cling:contract init` (kickoff 시).

## AI access (herdr agent-skill 패턴)
> MCP 서버 **아님**. herdr 방식 = **CLI + `SKILL.md`(agent-skill)**. https://herdr.dev/docs/agent-skill/

- **CLI** = `gootte`(예: `gootte next <project>` · `gootte lineage <project>` · `gootte status`). 관리대상 md SoT 읽어 상태 계산.
- **SKILL.md** = 에이전트에게 "관리 컨텍스트(env 신호)면 `gootte` CLI 로 현재 전선·다음 할일·왜(lineage) 질의" 지시.
- **floor** = 각 프로젝트 repo 안 **digest 파일**(세션 부팅 수동 read, 인프라 0). CLI = live 층.
- 상세(CLI 명령셋 · SKILL.md · env 신호 · digest 스키마) = **kickoff 설계.**

## Operations (Runbook)
> `/cling:ops` 생성 — 루트 `package.json` scripts → `code/web` 위임(러너=pnpm). **repo 루트에서 실행.**

| 명령 | 목적 | who | 비고 |
|---|---|---|---|
| `pnpm setup` | 최초 1회 의존 설치 | claude-ok | `pnpm -C code/web install` |
| `pnpm plan <project>` | 순서(full)+왜 출력 | claude-ok | 읽기 전용 · 파일 X (`pnpm -s plan` = clean) |
| `pnpm digest <project>` | `<project>/.gootte/PLAN.md` emit | claude-ok | AUTO-GENERATED · **타깃 폴더**에 생성 |
| `pnpm discover <root>` | 로컬 cling 프로젝트 발견 | claude-ok | 읽기 전용 |
| `pnpm verify` | tsc + vitest | claude-ok | 전체 회귀 |
| `pnpm test` | vitest | claude-ok | |
| `pnpm dev:backend` | Hono API dev 서버 | user-runs | `tsx watch` · env `PORT`(기본 8804)·`GOOTTE_ROOTS`(기본 `~/Documents`) |
| `pnpm dev:frontend` | Vite dev 서버 | user-runs | `:5304` · `/api` → backend 프록시(`VITE_BACKEND_URL` 기본 `:8804`) |
| `pnpm dev` | backend+frontend 동시 | user-runs | `-r --parallel run dev` (둘 다 dev 스크립트 보유) |
> 포트 = 글로벌 레지스트리 배정(main backend 8804 / frontend 5304). worktree 는 `/cling:worktree` 가 밴드 격리 주입. 점검 = `/cling:check`.
> worktree node_modules = `pnpm -C code/web install`(1회, claude-ok) — 전용 스크립트 불요.

## Ports
> 글로벌 레지스트리 `~/.cling/ports`(엔진 `~/.cling/bin/port-alloc.sh`)가 배정·충돌 방지. 2-밴드.

- **main 밴드 배정:** backend `8804` · frontend `5304` (레지스트리 active — `port-alloc alloc main <role> gootte`). 대역 = backend 8800–8899 / frontend 5300–5399.
- **worktree 밴드:** `/cling:worktree` 가 진입 시 동적 alloc(8900–8999 / 5400–5499), `worktree-end` 가 역치환+release.
- **port-site(재기록 대상):**
  - `code/web/backend/src/server.ts` — `PORT ?? 8804` (backend dev 기본 포트)
  - `code/web/frontend/vite.config.ts` — `server.port` (= 5304) + `VITE_BACKEND_URL ?? http://localhost:8804` (프록시 대상)
- **machine-readable 매니페스트** (아래 — `port-inject` 엔진이 파싱해 *모든* port-site 를 빠짐없이 주입/역치환. 수동 sed 누락 방지). role = 그 파일에 박힌 포트의 밴드(backend 8800–8999 / frontend 5300–5499). 새 port-site 추가 시 위 목록 + 아래 블록 둘 다 갱신.

<!-- cling:port-sites
backend  code/web/backend/src/server.ts
backend  code/web/frontend/vite.config.ts
frontend code/web/frontend/vite.config.ts
-->

- worktree node_modules = 진입 후 `pnpm -C code/web install` 1회(claude-ok, 멱등) — 복사할 untracked dev secret 없음이라 전용 bootstrap 섹션 불요.
- aging: `/cling:check` 가 last_seen 갱신 + `port-alloc gc`.

## Tracks
> 대분류(track) 통제 어휘 — blueprint `## phases` 표 `track` 열이 이 key 를 쓴다. label SoT(normalizeTrack 이 vocab 우선, 없으면 프로즈). 순서 = 대시보드 그룹 순서.

| key | label |
|---|---|
| E | 엔진/lineage |
| W | 웹 대시보드 |
| R | 원격/모바일 |
| X | 확장 |

## Docs layout
- roadmap: `docs/roadmap/`   # kickoff 산출물 (brief/spec/wireframe/adr/ledger)
- todo:    `docs/todo/`
- sprint:  `docs/sprint/`
- spec(SoT 승격): `docs/spec/`
- 인박스: `docs/_memo/` (gitignore)

## Mermaid SoT
> 프로젝트 관통 구조 다이어그램 = `docs/mermaid/` 단일 SoT. 규약 = `docs/mermaid/INDEX.md`. kickoff 가 `M-NNNN` 생성. drift-guard = `scripts/mermaid-refs-check.sh`(verify gate 포함).

## Verify gate
- 완료 판정 = 변경 컴포넌트의 verify(컴파일 + 테스트) green. 컴파일/진단만으로 완료 금지.
- **🔴 contract drift-guard** — `web/contract` 변경 시 `contract:check`(codegen rerun + diff 0) 포함.
- **🔴 mermaid refs drift-guard** — 문서 변경 sprint 는 `bash scripts/mermaid-refs-check.sh` 포함.
- 코드 생기면 컴포넌트별 verify 확정(첫 코드 후 init 재실행).

## Invariants (프로젝트 불변식)
- **INV-1** — projection(digest · render-data)은 **관리대상 프로젝트의 md SoT 에서 재생성**되는 파생물. 손으로 유지되는 2차 SoT 금지(desync = 틀린 다음-할일 = 원 통증 재발).
- **INV-2** — gootte 는 관리대상 프로젝트 문서를 **읽기 전용**. gootte 는 자기 **`.gootte/` 네임스페이스만** 생성·write(AUTO-GENERATED) + `.gitignore` 1줄 append. cling SoT 문서(ledger/spec/adr/todo)는 **절대 mutate X**. (carve-out — blueprint B4)
- **INV-3** — 뷰·digest 는 **항상 현재 SoT 반영**(실시간 체크·재생성). stale 뷰 금지.
- **INV-4** — gootte **read-path(plan/lineage/digest 생성)는 결정적·LLM-free.** 산문 "왜"는 요약 말고 **verbatim 릴레이** — 지능(왜 판단)은 write-time(cling 세션 AI) 캡처, read-time 은 계산·릴레이만. (lineage-supersede ADR-0002)

## Delegation policy
- mode: `solo`

## Memory policy
- format: `governed`
- enforce: `plain`

## Test strategy per layer
- `web/backend`·`web/frontend`: 단위(vitest) + 계약(zod/codegen diff)
- `web/contract`: codegen 재실행 diff 0
- `app`(추후): 도메인 JVM 단위 + 수동 QA

## Conventions
- **frontend 스택 (하드 룰)**: CSS = **Tailwind** · icon = **Tabler 전용**(타 아이콘 라이브러리 금지) · font = **Pretendard**
- worktree path: `.claude/worktrees/<slug>`
- 실행 자율성 + 검토 게이트: worktree 개발·verify 자율 → **verify green 이면 멈추고 사용자 검토** → OK 후 `worktree-end`.
- commit/push: 명시 요청 시만. 외부 전송/삭제/비가역: 확인 후.
- 언어: 사용자와 동일 언어로 응답.
