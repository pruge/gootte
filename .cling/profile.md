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
> 코드 생기면 `/cling:ops` 가 실행체(pnpm scripts) 생성/동기. 아래는 spec 확정 명령.

| 명령 | 목적 | who | 비고 |
|---|---|---|---|
| `gootte plan <project>` | 순서(full)+왜 출력 | claude-ok | 읽기 전용 |
| `gootte digest <project>` | `<repo>/.gootte/PLAN.md` emit | claude-ok | AUTO-GENERATED, gitignore |
| `gootte discover` | 로컬 cling 프로젝트 자동발견 | claude-ok | 읽기 전용 |
| `pnpm --filter @gootte/cli build` | CLI 빌드 | claude-ok | |
> web dev 서버(2차) · 터널(3차) = 그 phase 에서 추가.

## Ports
> web dev 서버(vite frontend + backend) 생기면 `/cling:check` 가 main 밴드(8800–8899 / 5300–5399) 배정 + port-site 주입. 지금 config 없어 보류.

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
