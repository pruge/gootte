# gootte — 프로젝트 지침

> **firstmate 프로젝트들을 프로젝트별로 실시간 관리하는 대시보드.** 각 프로젝트의
> `docs/features/` 를 자동 read → **기능별 할일 목록**, 그리고 `~/.treehouse` 격리 사본을 관측해
> **지금 누가 무엇을 붙들고 있는지**를 그 목록 위에 표시한다. 핵심 = **"다음 무엇 / 지금 누가"** 를
> 한 화면에서 잡게 하는 것 — 어느 쪽도 파일에 손으로 적히지 않고 볼 때마다 계산된다.
> TS 모노레포(`code/web/`, pnpm workspace) · Hono backend · React+Vite frontend · zod contract.

이 파일이 이 저장소 지침의 **유일한 실파일**이다. `CLAUDE.md` 는 `@AGENTS.md` 임포트 한 줄로 이 파일을 당겨 오는 스텁 파일이다.
문서 관례(티켓 서식·`Status:` 어휘·탐색 순서)는 [`docs/agents/`](docs/agents/) 가 갖는다.

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

## Track 통제 어휘 — 은퇴했다

**이 저장소에 track 어휘는 더 이상 없다.** 대분류(E/W/R/X)는 은퇴한 워크플로우의 blueprint
`## phases` 표에서 오던 값이고, 그것을 읽던 파서·정규화·그룹 순서가 전부
`firstmate-project-source` 티켓 04 에서 사라졌다. 지금 작업의 묶음 단위는 **기능 폴더**
(`docs/features/<기능>/`) 하나뿐이고, 순서는 티켓의 `Blocked by:` 가 소유한다
([`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md)).

옛 문서에서 `track: E` 같은 줄을 보더라도 되살려 쓰지 않는다 — 동결된 역사다.

## 실행 명령 — 루트에서 실행, 루트 `package.json` 이 `code/web` 으로 위임

러너는 pnpm 이다. **모든 명령은 저장소 루트에서 실행한다.** 루트 스크립트는 얇은 위임층이고,
실제 스크립트는 `code/web/package.json` 과 각 패키지에 있다. 명령이 궁금하면 그 두 파일이 권위다.

| 명령 | 목적 | 누가 |
|---|---|---|
| `pnpm setup` | 최초 1회 의존 설치 (`pnpm -C code/web install`) | 에이전트 가능 |
| `pnpm verify` | **전체 회귀 — 포트 테스트 + tsc + vitest** | 에이전트 가능 |
| `pnpm test` | vitest 만 | 에이전트 가능 |
| `pnpm test:ports` | 포트 해석기 테스트만 (`scripts/tests/ports.test.sh`) | 에이전트 가능 |
| `pnpm discover <root>` | 로컬 관리대상 프로젝트 발견 · 읽기 전용 | 에이전트 가능 |
| `pnpm gootte discover <…>` | 같은 것을 CLI 로 직접 호출 | 에이전트 가능 |
| `pnpm gootte step <프로젝트> <기능>/<티켓> <N>` | 티켓 하나에 단계를 매긴다(plan-board/05) | firstmate |
| `pnpm gootte step --clear <프로젝트> <기능>/<티켓>` | 단계를 뗀다 | firstmate |
| `pnpm gootte board <프로젝트>` | 다섯 칸 현황을 읽는다 — 읽기 전용, 자리·순서를 바꾸는 CLI 는 없다 | 누구나 |
| `pnpm gootte next <프로젝트>` | 작업 대상에 있는 기능의, 표시 기준 1단계 티켓만 말한다(plan-board/05) | firstmate |
| `gootte start [--at <TIME>] <기능> <티켓>` / `gootte end [--at <TIME>] <기능> <티켓>` | 티켓 문서에 `Time: started=<ISO>`/`finished=<ISO>` 를 기록한다. 두 관례를 본다 — 신관례 `docs/features/<기능>/tickets/T<NN>.md`(`Time:` 줄)·구관례 `docs/features/<기능>/issues/<NN>-*.md`(`**Time:**` 줄). `--at <TIME>` 로 시각 지정(비면 지금, ISO8601 또는 상대시간 `1h30m`/`90m`/`2h`/`1d`). `bin/gootte` — TS 모노레포(`@gootte/*`)를 전혀 참조하지 않는 독립 bash 스크립트, `npm i -g .`/`npm link` 로 어느 프로젝트에서든 전역 설치 가능. cwd 기준(git 루트 우선) — `<프로젝트>` 인자 없음. 커밋 안 함(파일만 편집) | 누구나 |
| `pnpm dev:backend` | Hono API dev 서버 (`scripts/dev-backend.sh` → `tsx watch`) | 캡틴 사본 = **캡틴만**. 격리 사본 = **작업자가 스스로** |
| `pnpm dev:frontend` | Vite dev 서버 (`scripts/dev-frontend.sh`, `/api` → backend 프록시) | 캡틴 사본 = **캡틴만**. 격리 사본 = **작업자가 스스로** |
| `pnpm dev` | backend + frontend 동시 (`scripts/dev.sh`) | 캡틴 사본 = **캡틴만**. 격리 사본 = **작업자가 스스로** |
| `pnpm dev:stop` | dev 서버 정리 (`scripts/dev-stop.sh`) | 캡틴 사본 = **캡틴만**. 격리 사본 = **자기가 띄운 것만 작업자가** |
| `pnpm dev:tauri` | macOS 데스크톱 셸 debug 실행 (`code/web/src-tauri/` — 셸이 backend+vite 를 자식으로 띄우고 창 닫히면 정리) | 캡틴 사본 = **캡틴만**. 격리 사본 = **작업자가 스스로** |
| `pnpm build:tauri` | 완성 .app 번들 (`scripts/tauri-build.sh` — frontend 빌드 후 `tauri build`) | 캡틴 사본 = **캡틴만**. 격리 사본 = **작업자가 스스로** |
| `pnpm e2e` | frontend playwright | 캡틴 사본 = **캡틴만**. 격리 사본 = **작업자가 스스로** |

`discover` 와 backend 가 어디를 뒤질지는 env `GOOTTE_ROOTS`(콜론 구분, 기본
`~/Documents/ai2/projects`)가 정한다. **"지금 누가 무엇을 붙들고 있나"** 를 관측할 격리 사본 뿌리는 env
`GOOTTE_TREEHOUSE`(기본 `~/.treehouse`) 다 — 기계마다 다르니 경로를 코드에 못 박지 않는다.
둘 다 `code/web/backend/src/app.ts` 가 SoT. 계획(INV-5) 저장 자리는 env `GOOTTE_DATA_DIR`(기본
`~/.gootte`) — `code/web/cli/src/main.ts` 가 SoT.

🔴 **`GOOTTE_DATA_DIR` 은 포트처럼 격리되지 않는다 — 값을 안 세우면 격리 사본도 캡틴의 `~/.gootte` 에
쓴다.** `code/web/backend/src/app.ts:55-57` 과 `code/web/cli/src/main.ts:6-8` 둘 다 이 env 가 비어 있으면
`~/.gootte` 로 떨어진다. `.ports.worktree`(아래)는 포트만 가르고 이 값은 아무도 안 갈라 준다. **격리
사본에서 dev 서버를 띄우거나 `gootte` CLI 를 쓸 때는 `GOOTTE_DATA_DIR` 을 그 사본 안의 경로로 직접
지정해라** — 안 그러면 시연·시험용으로 만든 프로젝트의 계획 행(placement·read_mark·read_seed)이
캡틴의 실제 계획 DB 에 섞여 들어간다(실제 사고, 2026-08-14: 격리 사본 작업자가 아래 옛 규칙을 "서버는
사용자만 띄운다"로 오독해 캡틴께 대신 띄워 달라 요청했고, 그 결과 시연이 캡틴 환경에서 돌아 캡틴의
`~/.gootte/plan.db` 가 오염됐다). 사본 생성 시 이 값을 자동으로 갈라 주는 구조적 해결은 별건이다 —
지금은 값을 직접 지정하는 것이 유일한 방어선이다.

### dev 포트 — `scripts/ports.sh` 가 유일한 판정자

세 dev 명령은 포트를 소스 기본값이 아니라 **`scripts/ports.sh`** 에서 받는다. 규칙은
**`code/web/.ports.worktree` 가 있으면 그 값, 없으면 `code/web/.ports.main` 값** — 판정은
**파일 존재 여부만** 보고 작업 사본 경로를 캐묻지 않는다.

- `.ports.main` = tracked, 메인 사본 배정값(backend `8804` / frontend `5304`). 이 파일이 dev 포트의 SoT다.
  `vite.config.ts` · `server.ts` 안의 같은 숫자는 그 사본일 뿐이니 **포트를 바꿀 땐 `.ports.main` 을 고친다.**
- `.ports.worktree` = gitignore. **쓰는 주체는 firstmate**(격리 사본 생성 시). 이 저장소는 읽기만 한다 —
  에이전트가 이 파일을 만들거나 고치지 않는다.
- 🔴 **둘 다 없거나 값이 비었거나 숫자가 아니면 조용히 기본값으로 넘어가지 않고 오류로 멈춘다.**
  조용한 폴백 = 두 사본이 같은 포트를 쥔 채 아무도 모르는 상태. 그 거절이 설계의 요점이므로
  기본값 폴백을 되살리지 않는다(`pnpm test:ports` 가 이 거절을 지킨다).

격리 사본(worktree)에서는 진입 후 `pnpm setup` 을 한 번 돌린다(멱등). 복사해야 할 untracked dev secret 은 없다.

**캡틴 작업 사본의 dev 서버(백엔드 `8804` · 프론트 `5304`, `~/Documents/ai2/projects/gootte`)는 죽이거나
재시작하거나 포트를 헤집지 않는다** — 이 줄의 원래 뜻이 그것이다. 🔴 **격리 사본의 작업자에게는 반대로
적용된다** — `.ports.worktree` 가 배정한 자기 포트로 **자기 dev 서버를 스스로 띄우고**, 확인이 끝나면
**자기가 띄운 것만** 내린다. `pkill`·`killall` 같은 **패턴 종료 금지** — 옆 사본과 캡틴 서버까지 같이
죽는다. 포트를 비울 때는 firstmate 의 포트 한정 도우미를 쓴다.
🔴 **"dev 서버는 사용자가 띄운다" 를 캡틴이 대신 띄워 준다는 뜻으로 읽지 마라** — 그 오독으로 격리
사본 작업자가 캡틴께 대신 띄워 달라 요청했고, 시연이 캡틴 환경에서 돌아 캡틴의 실제 계획 DB 가
오염된 적이 있다(2026-08-14, 위 `GOOTTE_DATA_DIR` 문단 참고).

## 구조 파악 — codegraph 로 한다

코드 구조·호출 경로·blast radius 는 grep 이 아니라 **codegraph** 로 묻는다.
색인은 **저장소 뿌리**의 `.codegraph/`(gitignore, 머신 로컬)에 있다 — 자매 저장소 jinwooauto 와 같다.
**명령에 경로를 줄 필요가 없다.** 없으면 **뿌리에서** `codegraph init` 으로 만든다.
🔴 **`init code/web` 처럼 하위 경로에 만들지 마라** — 색인이 둘로 갈라지고 좁은 쪽이 뿌리 답을 못 낸다
(2026-08-10 정정. 그전까지 이 줄은 색인이 `code/web/` 에 있다고 적었으나 그런 자리는 없었다 —
[`docs/agents/codegraph/README.md`](docs/agents/codegraph/README.md) §이 저장소의 색인 위치).

🔴 **`explore` 만 쓰지 마라** — 질문이 정해져 있으면 그 질문의 명령이 따로 있다:
`impact`(바꾸면 어디가 깨지나 — **편집 전**) · `callers`(누가 부르나) · `callees`(무엇에 기대나) ·
`affected`(어느 테스트를 돌리나 — **편집 후**) · `node`(심볼 하나 + 현재 줄번호). 문법은 `codegraph --help`.
🔴 **편집한 뒤에는 `codegraph sync`** — 색인은 편집을 자동으로 안 따라와 낡은 답을 자신 있게 준다.
남이 건드린 것, `git pull`·브랜치 전환도 sync 하면 반영된다(변경분만, 초 단위).
🔴 **개수만 보고 판단하지 마라 — `kind` 열을 봐라.** caller 줄번호는 **그 심볼의 정의 줄**이지 호출 줄이
아니고, `file … :1` 은 잘린 값이 아니라 함수 밖 호출이며, `callees` 는 타입 참조까지 센다.

🔴 codegraph 의 `No results found` 는 "코드에 없다" 가 **아니다.** 색인은 조용히 낡는다 — 없다고 판정하기
전에 grep 교차확인 → 재색인 → 재질의 순으로 확인한다.
`codegraph status` 의 "up to date" 는 신선도 근거가 못 된다.

**한국어 개념어 → 영문 앵커 사전은 [`docs/agents/codegraph/`](docs/agents/codegraph/) 에 있다** —
개념어에서 코드로 갈 때 먼저 거기를 본다.

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

이 파일이 지침의 **유일한 실파일**이다 — `CLAUDE.md` 는 `@AGENTS.md` 임포트로 이 파일을 가리키는 스텁 파일이다.
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
| Track 어휘 | 그 어휘가 왜 없는가 | 은퇴 사실과 대체물(기능 폴더 · `Blocked by:`)만. 되살릴 일이 생기면 새 결정이다 |
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
