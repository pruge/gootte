# gootte — 프로젝트 지침

> **firstmate 프로젝트들을 프로젝트별로 실시간 관리하는 대시보드.** 각 프로젝트의
> `docs/features/` 를 자동 read → **기능별 할일 목록**, 그리고 `~/.treehouse` 격리 사본을 관측해
> **지금 누가 무엇을 붙들고 있는지**를 그 목록 위에 표시한다. 핵심 = **"다음 무엇 / 지금 누가"** 를
> 한 화면에서 잡게 하는 것 — 어느 쪽도 파일에 손으로 적히지 않고 볼 때마다 계산된다.
> TS 모노레포(`code/web/`, pnpm workspace) · Hono backend · React+Vite frontend · zod contract.

이 파일이 **매 요청에 실리는 지침**이고, 고칠 때는 항상 이 파일을 고친다(`CLAUDE.md` 는 `@AGENTS.md`
임포트 한 줄짜리 스텁이다). 🔴 **그 일을 할 때만 필요한 것은 여기 두지 않는다** — 티켓 서식·브라우저
도구·dev 서버 규율은 **스킬**로 갈라 두었고, 문서 관례는 [`docs/agents/`](docs/agents/) 가 갖는다.
아래 §문서 관례 표가 어느 것이 어디 있는지 말한다. 고치는 절차는
[`docs/agents/maintaining-agents-md.md`](docs/agents/maintaining-agents-md.md).

> 이 저장소는 cling 워크플로우로 지어졌고 **firstmate 관리로 전환을 마쳤다**
> (`docs/features/firstmate-migration/` · `docs/features/firstmate-project-source/`).
> `.cling/` 도, 그것을 읽던 제품 코드도 **모두 삭제됐다** — 그 안에 있던 지식의 후계자가
> 이 파일이므로, 지침의 근거는 언제나 여기다. 관리대상 문서를 읽는 경로는 이제
> `docs/features/` 하나뿐이다.

## 🔴 제품 불변식 (모든 기능 개발 시 의무 점검)

기능을 짓기 직전에 아래가 해당하는지 점검하고, 해당하면 설계에 반영하고 spec·티켓에 명시한다.

- **INV-1 — 파생물만.** projection(막힘 해제 · 처리중 · render-data)은 **관리대상의 md SoT 와 격리 사본
  관측에서 재생성**되는 파생물이다. 손으로 유지되는 2차 SoT 금지 — desync = 틀린 다음-할일 =
  이 제품이 없애려는 통증의 재발. (사람만 아는 계획 자체를 저장해도 되는 경계는 INV-5 가 갖는다.)
- **INV-2 — 관리대상은 읽기 전용.** gootte 는 관리대상 프로젝트 문서를 **읽기만** 한다.
  관리대상의 SoT 문서(`docs/features/` 의 spec·티켓·adr)는 **절대 mutate 하지 않는다** —
  처리중 표시를 티켓 파일에 적어 넣는 것도 여기 포함된다.
  (지금 gootte 는 관리대상에 **아무것도 쓰지 않는다.** 쓰기가 생긴다면 자기 `.gootte/` 네임스페이스
  안이어야 하고, 그때 그 산출물은 AUTO-GENERATED 헤더를 단다.)
- **INV-3 — stale 뷰 금지.** 뷰는 **항상 현재 SoT 를 반영**한다(실시간 체크·재계산).
- **INV-4 — read-path 는 결정적·LLM-free.** 할일 목록·막힘 해제·처리중 판정은 전부 계산이다.
  산문 "왜" 는 요약하지 말고 **verbatim 릴레이** — 지능(왜 판단)은 write-time 에 캡처되고,
  read-time 은 계산과 릴레이만 한다.
- **INV-5 — 계획은 저장하고 사실은 저장하지 않는다.** 사람이 정한 것(단계 · 기능 순위 · 트랙 · 왜)은
  gootte 자기 저장소에 저장한다. **원본을 다시 읽어 같은 값이 나오는 것은 저장하지 않는다** —
  티켓 상태 · 막힘 · 착수 가능 여부 · 처리중 · 임자 · 완료 · 제목.
  판단 기준 한 줄: **다른 어디에도 없는 것만 저장할 자격이 있다.**
  (`docs/features/development-order/`)

빠른 판단: 새 파일을 쓰려 한다 → INV-1·INV-2, 단 사람만 아는 계획(단계·순위·트랙·왜)이면 INV-5 가 저장을
허락한다 / 캐시·스냅샷을 두려 한다 → INV-1·INV-3 / 요약·추론을 넣으려 한다 → INV-4.

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
| `scripts` | `scripts/` | `pnpm test:ports` (= `scripts/tests/ports.test.sh`, 임시 디렉토리 픽스처) |
| `src-tauri` | `code/web/src-tauri/` | `cargo check` + `cargo clippy -- -D warnings`(컴파일+테스트 중 컴파일 축 — 수동 실행 검증은 `pnpm dev:tauri`) |

전체 회귀는 루트에서 **`pnpm verify`** (= `pnpm test:ports` + `tsc --noEmit` 전 패키지 + `vitest run`) 한 방이다.
후속 컴포넌트가 붙으면(계획된 것 = Kotlin/Android 뷰어) 그 컴포넌트의 verify 도 **컴파일 + 테스트** 두 축을
같이 갖춰야 하며, 갖춰지는 시점에 이 표에 한 줄을 더한다.
테스트는 **이 저장소 자신의 `docs/` 를 픽스처로 쓰지 않는다** — 전부 임시 디렉토리에 픽스처를 합성한다
(`cli/src/cli.test.ts` · `core-io/src/features.test.ts` · `backend/test/app.test.ts`).
따라서 이 저장소의 문서를 옮기거나 지워도 `pnpm verify` 는 영향받지 않는다(다르면 예측이 틀린 것이니 멈추고 보고).

## Contract — 공유 SoT 와 drift-guard

경계를 넘는 공유 타입(프로젝트 · 기능/티켓 · 처리중 관측 · 실시간 메시지)은
**`code/web/contract/src/index.ts` 의 zod 정의 한 곳**에서만 정의하고 소비처가 파생한다.
TS 소비처(`core` `core-io` `cli` `backend` `frontend`)는 `@gootte/contract` 를 workspace 로 직접 import 한다.

- 🔴 **codegen 산출물은 SoT 가 아니다 — 손편집 금지.** 생성물은 헤더에
  `AUTO-GENERATED — DO NOT EDIT` 를 달고, 고칠 곳은 언제나 zod 정의 쪽이다.
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
- **끌어 놓기 = dnd-kit.** (`@dnd-kit/core`·`sortable`·`utilities`) HTML5 네이티브 drag 이벤트나
  다른 DnD 라이브러리로 갈아타지 않는다 — **포인터 기반**이라 `chrome-devtools-axi drag` 로 실제
  브라우저에서 끌어 볼 수 있고, 네이티브 drag 로 바꾸면 그 확인 경로가 통째로 사라진다.
- **긴 목록 가상 스크롤 = TanStack Virtual.** (`@tanstack/react-virtual`) 화면 밖 카드를 그리지 않는
  목록(예: `features` 탭)은 이 라이브러리로 짠다 — 높이를 재는 목록을 정면으로 다루고, 모양을
  강요하지 않는다(a-long-list-stays-usable/02).

## 실행 명령 — 루트에서 실행, 루트 `package.json` 이 `code/web` 으로 위임

러너는 pnpm 이다. **모든 명령은 저장소 루트에서 실행한다.** 루트 스크립트는 얇은 위임층이고,
실제 스크립트는 `code/web/package.json` 과 각 패키지에 있다. **명령의 세부 인자는 그 두 파일이 권위다.**

| 명령 | 목적 |
|---|---|
| `pnpm setup` | 최초 1회 환경 준비(웹 의존성 + macOS Tauri) — 멱등 |
| **`pnpm verify`** | **전체 회귀 — 포트 테스트 + tsc + vitest.** 완료 판정은 이것이 green 인 것 |
| `pnpm test` · `pnpm test:ports` | vitest 만 · 포트 해석기만 |
| `pnpm discover <root>` | 로컬 관리대상 프로젝트 발견(읽기 전용) |
| `pnpm gootte <step\|board\|next> …` | 계획 조회·단계 배정. `board`·`next` 는 읽기 전용 |
| `gootte start/end/pause/resume/cancel/drop` | 🔴 **티켓의 `Time:` 을 기록하는 유일한 주체.** → 스킬 `gootte-ticket` |
| `pnpm dev` · `dev:tauri` · `build:tauri` · `e2e` | dev 서버·데스크톱 셸·e2e → 🔴 **띄우기 전에 스킬 `gootte-dev-server`** |

`discover` 와 backend 가 뒤질 곳은 env `GOOTTE_ROOTS`(기본 `~/Documents/ai2/projects`)가 정한다.
격리 사본 관측 뿌리는 `GOOTTE_TREEHOUSE`(기본 `~/.treehouse`)이고, 여기에 **worktree 두 종류**가
더해진다 — Claude Code 의 `<프로젝트>/.claude/worktrees/<이름>` 과 BB 스레드의
`<뿌리>/<env_XXXX>/<프로젝트>`(`GOOTTE_BB_WORKTREES`, 기본 `~/.bb/worktrees`).
셋 다 `core-io/src/treehouse.ts` 가 SoT 이고 슬러그로 갈린다. 계획(INV-5) 저장 자리는
`GOOTTE_DATA_DIR`(기본 `~/.gootte`).

🔴 **`GOOTTE_DATA_DIR` 은 포트처럼 격리되지 않는다** — 안 세우면 격리 사본도 캡틴의 `~/.gootte` 에
쓴다. 실제 사고가 있었다(2026-08-14). 격리 사본에서 dev 서버나 `gootte` CLI 를 쓸 때는 반드시
그 사본 안의 경로로 지정한다. 자세한 규율은 스킬 `gootte-dev-server`.

## 구조 파악 — codegraph 로 한다

코드 구조·호출 경로·blast radius 는 grep 이 아니라 **codegraph** 로 묻는다. 색인은 **저장소 뿌리**의
`.codegraph/`(gitignore)에 있다 — 없으면 **뿌리에서** `codegraph init`. 🔴 하위 경로에 만들지 마라.

🔴 **`explore` 만 쓰지 마라** — 질문마다 명령이 따로 있다: `impact`(바꾸면 어디가 깨지나, **편집 전**) ·
`callers` · `callees` · `affected`(어느 테스트를 돌리나, **편집 후**) · `node`. 문법은 `codegraph --help`.
🔴 **편집 뒤에는 `codegraph sync`** — 색인은 편집을 자동으로 안 따라와 낡은 답을 자신 있게 준다.
🔴 **`No results found` 는 "코드에 없다" 가 아니다**(색인이 조용히 낡는다). `status` 의 "up to date" 도
신선도 근거가 못 된다. 없다고 판정하기 전에 grep 교차확인 → 재색인 → 재질의.

한국어 개념어 → 영문 앵커 사전과 결과 읽는 법(`kind` 열·줄번호의 의미)은
[`docs/agents/codegraph/`](docs/agents/codegraph/).

## 문서 관례 (`docs/agents/`)

작업 표면은 **`docs/features/<기능>/`** (`spec.md` + **`tickets/T<NN>.md`** + `adr/`) 다.
🔴 **새 티켓은 `tickets/T<NN>.md`** — 옛 `issues/<NN>-*.md` 는 읽히기만 하고 새로 만들지 않는다.
별도 원장은 없다 — **완료는 `gootte` 가 적는 `Time:` 줄이**, 순서는 `Blocked by:` 줄이 소유한다.
🔴 `Time:`·`Status:` 를 손으로 쓰지 않는다.

| 무엇 | 어디 |
|---|---|
| 🔴 **티켓을 쓰거나 닫을 때** | **스킬 `gootte-ticket`** |
| 🔴 **브라우저를 쓸 때**(두 도구 중 고르기) | **스킬 `gootte-browser`** |
| 🔴 **dev 서버를 띄울 때** | **스킬 `gootte-dev-server`** |
| 레이아웃·두 관례·`Blocked by:` 의미 | [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md) |
| `Status:` 아홉 값과 어디에 걸리는지 | [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md) |
| 탐색 순서 · 여섯 컨텍스트 · 은퇴한 어휘 | [`docs/agents/domain.md`](docs/agents/domain.md) |
| 개념어 → 영문 앵커 사전 | [`docs/agents/codegraph/`](docs/agents/codegraph/) |
| **이 파일(`AGENTS.md`)을 고칠 때** | [`docs/agents/maintaining-agents-md.md`](docs/agents/maintaining-agents-md.md) |
| 왜 이렇게 갈라 놨나 · 이 구조가 틀렸을 수 있는 지점 | [`docs/agents/agent-docs-diet.md`](docs/agents/agent-docs-diet.md) |

## 운영 규칙

- **커밋·푸시는 명시 요청 시만.** 외부 전송·삭제·비가역 동작은 확인 후.
- **개발 자율 → verify green 이면 멈추고 검토.** 격리 사본에서 짓고 verify 까지는 스스로 진행하되,
  green 이 되면 사용자 검토를 받는다.
- **언어** — 사용자와 같은 언어로 답한다. 이 저장소의 문서 본문은 한국어다(슬러그·식별자는 영문).
