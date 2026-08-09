# gootte — 프로젝트 지침

> **cling 프로젝트들을 프로젝트별로 실시간 관리하는 대시보드.** 각 프로젝트 문서를 자동 read →
> 칸반/달력/supersede 그래프(사람) + digest(AI). 핵심 = **연쇄 re-kickoff lineage 가시화** —
> 사람도 AI 도 "현재 / 왜 / 다음" 을 한 번에 잡게 한다.
> TS 모노레포(`code/web/`, pnpm workspace) · Hono backend · React+Vite frontend · zod contract.

이 파일이 이 저장소 지침의 **유일한 실파일**이다. `CLAUDE.md` 는 이 파일을 가리키는 심볼릭 링크다.
문서 관례(티켓 서식·`Status:` 어휘·탐색 순서)는 [`docs/agents/`](docs/agents/) 가 갖는다.

> 이 저장소는 cling 워크플로우로 지어졌고 지금 **firstmate 관리로 전환 중**이다
> (`docs/features/firstmate-migration/`). 전환이 끝나면 `.cling/` 은 사라진다 —
> 여기 적힌 지식이 그 파일들의 후계자이므로, `.cling/profile.md` 를 근거로 삼지 않는다.

## 🔴 제품 불변식 (모든 기능 개발 시 의무 점검)

기능을 짓기 직전에 아래가 해당하는지 점검하고, 해당하면 설계에 반영하고 spec·티켓에 명시한다.

- **INV-1 — 파생물만.** projection(digest · render-data)은 **관리대상 프로젝트의 md SoT 에서 재생성**되는
  파생물이다. 손으로 유지되는 2차 SoT 금지 — desync = 틀린 다음-할일 = 이 제품이 없애려는 통증의 재발.
- **INV-2 — 관리대상은 읽기 전용.** gootte 는 관리대상 프로젝트 문서를 **읽기만** 한다. 쓰는 것은 자기
  **`.gootte/` 네임스페이스뿐**(AUTO-GENERATED) + `.gitignore` 한 줄 append. 관리대상의 SoT 문서
  (ledger/spec/adr/todo)는 **절대 mutate 하지 않는다.**
- **INV-3 — stale 뷰 금지.** 뷰·digest 는 **항상 현재 SoT 를 반영**한다(실시간 체크·재생성).
- **INV-4 — read-path 는 결정적·LLM-free.** plan/lineage/digest 생성은 계산이다. 산문 "왜" 는 요약하지 말고
  **verbatim 릴레이** — 지능(왜 판단)은 write-time 에 캡처되고, read-time 은 계산과 릴레이만 한다.

빠른 판단: 새 파일을 쓰려 한다 → INV-1·INV-2 / 캐시·스냅샷을 두려 한다 → INV-1·INV-3 /
요약·추론을 넣으려 한다 → INV-4.

## Verify gate — 컴파일만으로 완료 금지

**완료 판정 = 변경한 컴포넌트의 verify(컴파일 + 테스트)가 green.** 컴파일이나 진단(LSP)만 통과한 상태를
완료로 보고하지 않는다.

| 컴포넌트 | 경로 | verify |
|---|---|---|
| `contract` | `code/web/contract/` | `tsc --noEmit` + 소비처 회귀 + **contract drift-guard**(아래) |
| `core` | `code/web/core/` | `tsc --noEmit` + `vitest` (단위 — 순수 함수라 여기서 대부분을 막는다) |
| `core-io` | `code/web/core-io/` | `tsc --noEmit` + `vitest` (임시 디렉토리 픽스처) |
| `cli` | `code/web/cli/` | `tsc --noEmit` + `vitest` |
| `backend` | `code/web/backend/` | `tsc --noEmit` + `vitest` (단위 + 계약) |
| `frontend` | `code/web/frontend/` | `tsc --noEmit` + `vitest` (단위 + 계약). e2e = `pnpm e2e`(playwright, 별도) |

전체 회귀는 루트에서 **`pnpm verify`** (= `tsc --noEmit` 전 패키지 + `vitest run`) 한 방이다.
후속 컴포넌트가 붙으면(계획된 것 = Kotlin/Android 뷰어) 그 컴포넌트의 verify 도 **컴파일 + 테스트** 두 축을
같이 갖춰야 하며, 갖춰지는 시점에 이 표에 한 줄을 더한다.
테스트는 **이 저장소 자신의 `docs/` 를 픽스처로 쓰지 않는다** — 전부 임시 디렉토리에 픽스처를 합성한다
(`cli/src/cli.test.ts` · `core-io/src/tree.test.ts` · `backend/test/app.test.ts`).
따라서 이 저장소의 문서를 옮기거나 지워도 `pnpm verify` 는 영향받지 않는다(다르면 예측이 틀린 것이니 멈추고 보고).

## Contract — 공유 SoT 와 drift-guard

경계를 넘는 공유 타입(프로젝트 상태 모델 · digest 스키마 · CLI 출력 · 실시간 메시지)은
**`code/web/contract/src/index.ts` 의 zod 정의 한 곳**에서만 정의하고 소비처가 파생한다.
TS 소비처(`core` `core-io` `cli` `backend` `frontend`)는 `@gootte/contract` 를 workspace 로 직접 import 한다.

- 🔴 **codegen 산출물은 SoT 가 아니다 — 손편집 금지.** 생성물은 헤더에
  `AUTO-GENERATED — DO NOT EDIT` 를 달고, 고칠 곳은 언제나 zod 정의 쪽이다.
  (같은 규율이 제품 산출물에도 적용된다 — `.gootte/PLAN.md` 헤더 = `code/web/core-io/src/emit.ts`.)
- 🔴 **drift-guard = codegen 재실행 후 `git diff` 0.** contract 를 건드린 변경은 이 검사를 verify 에 포함한다.
  생성물이 커밋과 어긋나 있으면 그 자체가 실패다.
- mode 는 **codegen(schema-first)** 이다. TS 소비처는 zod 를 직접 import 하고, 언어중립 소비처는
  JSON Schema 로, 후속 Kotlin 뷰어는 Kotlin 생성물로 파생시킨다 — web-only 인 동안에도 schema-first 를 유지한다.
- 현재 실측: **codegen 타깃이 아직 없다.** TS 소비처가 zod 를 그대로 import 하므로 `codegen/` 스크립트도
  `generated/` 산출물도 스캐폴드되지 않았다(`ls code/web/contract`). 언어중립 소비처나 Kotlin 뷰어가 붙는
  시점에 polyglot 이 되며, 그때 위 두 규칙이 그대로 발효된다.
  **없다고 정책이 사라진 것이 아니라 아직 발효 전이다.**

## 프론트엔드 하드룰

바꾸려면 지침을 먼저 고친다. 임의로 예외를 만들지 않는다.

- **CSS = Tailwind.** (v4, `@tailwindcss/vite`)
- **아이콘 = Tabler 전용.** `@tabler/icons-react` 외 **다른 아이콘 라이브러리 금지.**
- **폰트 = Pretendard.** (`code/web/frontend/index.html` 로드 · `src/styles/global.css` 의 `--font-sans`)

## Track 통제 어휘 (E / W / R / X)

대분류(track) 통제 어휘. blueprint `## phases` 표의 `track` 열이 이 key 를 쓰고, 대시보드의 그룹 순서가 곧
이 순서다. label 의 SoT 는 이 표이며, 파서(`normalizeTrack`, `code/web/core/src/parse/track.ts`)가
어휘에 있으면 canonical label 을, 없으면 프로즈에서 파생한 label 을 쓴다.

| key | label |
|---|---|
| E | 엔진/lineage |
| W | 웹 대시보드 |
| R | 원격/모바일 |
| X | 확장 |

## 실행 명령 — 루트에서 실행, 루트 `package.json` 이 `code/web` 으로 위임

러너는 pnpm 이다. **모든 명령은 저장소 루트에서 실행한다.** 루트 스크립트는 얇은 위임층이고,
실제 스크립트는 `code/web/package.json` 과 각 패키지에 있다. 명령이 궁금하면 그 두 파일이 권위다.

| 명령 | 목적 | 누가 |
|---|---|---|
| `pnpm setup` | 최초 1회 의존 설치 (`pnpm -C code/web install`) | 에이전트 가능 |
| `pnpm verify` | **전체 회귀 — tsc + vitest** | 에이전트 가능 |
| `pnpm test` | vitest 만 | 에이전트 가능 |
| `pnpm plan <project>` | 순서(full) + 왜 출력 · 읽기 전용 | 에이전트 가능 |
| `pnpm lineage <project>` | supersede lineage 출력 · 읽기 전용 | 에이전트 가능 |
| `pnpm digest <project>` | `<project>/.gootte/PLAN.md` emit — **타깃 폴더**에 생성 | 에이전트 가능 |
| `pnpm discover <root>` | 로컬 관리대상 프로젝트 발견 · 읽기 전용 | 에이전트 가능 |
| `pnpm gootte <…>` | CLI 직접 호출 (위 네 개의 상위 명령) | 에이전트 가능 |
| `pnpm dev:backend` | Hono API dev 서버 (`tsx watch`) | **사용자가 띄운다** |
| `pnpm dev:frontend` | Vite dev 서버 (`/api` → backend 프록시) | **사용자가 띄운다** |
| `pnpm dev` | backend + frontend 동시 | **사용자가 띄운다** |
| `pnpm dev:stop` | dev 서버 정리 (`scripts/dev-stop.sh`) | **사용자가 띄운다** |
| `pnpm e2e` | frontend playwright | **사용자가 띄운다** |

`plan`·`lineage`·`digest`·`discover` 가 어디를 뒤질지는 env `GOOTTE_ROOTS`(콜론 구분, 기본 `~/Documents`)가
정한다 — `code/web/backend/src/app.ts` 가 SoT.

격리 사본(worktree)에서는 진입 후 `pnpm setup` 을 한 번 돌린다(멱등). 복사해야 할 untracked dev secret 은 없다.
dev 서버는 사용자가 직접 띄운다 — 에이전트가 kill·재시작·포트 점검을 하지 않는다.

## 구조 파악 — codegraph 로 한다

코드 구조·호출 경로·blast radius 는 grep 이 아니라 **codegraph** 로 묻는다
(`codegraph explore "<심볼 또는 질문>" -p code/web`). 색인은 `code/web/.codegraph/`(gitignore, 머신 로컬)에
있고 없으면 `codegraph init code/web` 로 만든다. **한국어 개념어 → 영문 앵커 사전은
[`docs/agents/codegraph/`](docs/agents/codegraph/) 에 있다** — 개념어에서 코드로 갈 때 먼저 거기를 본다.

🔴 codegraph 의 `No results found` 는 "코드에 없다" 가 **아니다.** 색인은 조용히 낡는다 — 없다고 판정하기
전에 grep 교차확인 → 재색인 → 재질의 순으로 확인한다.

## 문서 관례 (`docs/agents/`)

| 무엇 | 어디 |
|---|---|
| spec·티켓 레이아웃, 티켓당 파일 1개, `Blocked by:` 의미, 코멘트 위치 | [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md) |
| 정규 `Status:` 여덟 값과 서식 (`resolved` 는 완료일 동반) | [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md) |
| 이 저장소를 탐색하기 전에 읽는 순서 · 여섯 컨텍스트 | [`docs/agents/domain.md`](docs/agents/domain.md) |
| 한국어 개념어 → 영문 앵커 사전 | [`docs/agents/codegraph/`](docs/agents/codegraph/) |

작업 표면은 **`docs/features/<기능>/`** (`spec.md` + `issues/NN-*.md` + `adr/`) 다.
별도 원장은 없다 — 상태는 티켓의 `Status:` 줄이, 순서는 `Blocked by:` 줄이 소유한다.

## 운영 규칙

- **커밋·푸시는 명시 요청 시만.** 외부 전송·삭제·비가역 동작은 확인 후.
- **개발 자율 → verify green 이면 멈추고 검토.** 격리 사본에서 짓고 verify 까지는 스스로 진행하되,
  green 이 되면 사용자 검토를 받는다.
- **언어** — 사용자와 같은 언어로 답한다. 이 저장소의 문서 본문은 한국어다(슬러그·식별자는 영문).

## Maintaining this file

이 파일이 지침의 **유일한 실파일**이다 — `CLAUDE.md` 는 이 파일을 가리키는 심링크다.
지침을 고칠 때는 항상 `AGENTS.md` 를 고치고, `CLAUDE.md` 를 실파일로 되돌리지 않는다.

### 이 문서의 구조

절의 순서가 곧 **읽는 순서**이고, 각 절은 답하는 질문이 하나씩이다. 새 지식은 지어내지 말고 아래 중
해당하는 절에 넣는다.

| 절 | 답하는 질문 | 여기 들어가는 것 / 안 들어가는 것 |
|---|---|---|
| 머리말 | 이 제품은 무엇인가 | 한 문단. 아키텍처 서술은 `docs/agents/domain.md` 로 |
| 제품 불변식 | 무엇을 어기면 안 되는가 | 번호가 붙은 항구적 규칙만. **번호는 재사용·리넘버하지 않는다** |
| Verify gate | 무엇이 "완료" 인가 | 컴포넌트별 검증 수단. 개별 테스트 작성법은 코드가 SoT |
| Contract | 공유 타입은 어디서 오는가 | SoT 위치와 drift-guard. 타입 목록 자체는 코드가 SoT |
| 프론트엔드 하드룰 | 무엇을 임의로 못 고르는가 | 선택 금지 항목만. 컴포넌트 관례는 코드가 SoT |
| Track 어휘 | 통제 어휘가 무엇인가 | key→label 표. 파서 동작은 코드가 SoT |
| 실행 명령 | 어떻게 돌리는가 | 루트 명령과 누가 돌리는지. 세부 인자는 `package.json` 이 SoT |
| 구조 파악 | 코드를 어떻게 찾는가 | 도구와 그 함정 |
| 문서 관례 | 문서를 어디에 쓰는가 | `docs/agents/` 로 가는 포인터만. 규약 본문은 그쪽이 SoT |
| 운영 규칙 | 어떻게 일하는가 | 세션 단위 행동 규율 |

### 항목을 추가·수정하는 절차

1. **먼저 물어본다: 코드나 명령이 이미 보여주는 것인가?** 그렇다면 여기 적지 말고
   **권위 있는 파일·명령을 가리킨다.** 복사한 사실은 반드시 낡는다.
2. **어느 절인지 위 표에서 고른다.** 어디에도 안 맞으면 새 절을 만들되, 그 줄을 위 표에도 추가한다.
   (표에 없는 절은 다음 사람이 구조를 코드에서 역추적하게 만든다.)
3. **문서 관례·탐색 순서·티켓 서식은 여기 쓰지 않는다** — `docs/agents/` 의 해당 파일에 쓰고
   여기서는 한 줄로 가리킨다.
4. **불변식을 추가할 때는 다음 번호를 새로 딴다.** 폐기해도 번호 슬롯은 남기고(링크 보존),
   본문에 무엇으로 대체됐는지 적는다.
5. **덧붙이기보다 고쳐 쓰거나 지운다.** 같은 사실이 두 절에 있으면 그 순간부터 둘 중 하나는 거짓이다.
6. 실측한 사실을 적을 때는 **무엇으로 확인했는지**(파일 경로나 명령)를 함께 적는다.

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
