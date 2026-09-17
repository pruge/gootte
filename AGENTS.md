# gootte — 프로젝트 지침

> **firstmate 프로젝트들을 프로젝트별로 실시간 관리하는 대시보드.** 각 프로젝트의
> `docs/features/` 를 자동 read → **기능별 할일 목록**, 그리고 `~/.treehouse` 격리 사본을 관측해
> **지금 누가 무엇을 붙들고 있는지**를 그 목록 위에 표시한다. 핵심 = **"다음 무엇 / 지금 누가"** 를
> 한 화면에서 잡게 하는 것 — 어느 쪽도 파일에 손으로 적히지 않고 볼 때마다 계산된다.
> TS 모노레포 (`code/web/`, pnpm workspace) · Hono backend · React+Vite frontend · zod contract.

이 파일이 **매 요청에 실리는 지침**이고, 고칠 때는 항상 이 파일을 고친다 (`CLAUDE.md` 는 `@AGENTS.md` 임포트 한 줄짜리 스텁이다). 🔴 **그 일을 할 때만 필요한 것은 여기 두지 않는다** — 티켓 서식·브라우저 도구·dev 서버 규율은 **스킬**로 갈라 두었고, 문서 관례는 [`docs/agents/`](docs/agents/) 가 갖는다.

## 불변식 (모든 기능 개발 시 의무 점검)

기능을 짓기 직전에 아래가 해당하는지 점검하고, 해당하면 설계에 반영하고 spec·티켓에 명시한다.

| 원칙 | 설명 |
|---|---|
| **INV-1 — 파생물만.** projection(막힘 해제 · 처리중 · render-data)은 **관리대상의 md SoT 와 격리 사본 관측에서 재생성**되는 파생물이다. 손으로 유지되는 2차 SoT 금지. |
| **INV-2 — 관리대상은 읽기 전용.** gootte 는 관리대상 프로젝트 문서를 **읽기만** 한다. |
| **INV-3 — stale 뷰 금지.** 뷰는 **항상 현재 SoT 를 반영**한다(실시간 체크·재계산). |
| **INV-4 — read-path 는 결정적·LLM-free.** 할일 목록·막힘 해제·처리중 판정은 전부 계산이다. 산문 "왜" 는 verbatim 릴레이. |
| **INV-5 — 계획은 저장하고 사실은 저장하지 않는다.** 사람이 정한 단계·순위·트랙·왜는 `.gootte/state.json` 혹은 `.gootte/memo.json` 에 저장. 다만 막힘·착수 가능 여부·처리중·제목은 저장하지 않는다. |

## Verify gate — 컴파일만으로 완료 금지

**완료 판정 = 변경한 컴포넌트의 verify(컴파일 + 테스트)가 green.** 컴파일이나 진단(LSP)만 통과한 상태를 완료로 보고하지 않는다.

| 컴포넌트 | 경로 | verify |
|---|---|---|
| `contract` | `code/web/contract/` | `tsc --noEmit` + 소비처 회귀 + **contract drift-guard** |
| `core` | `code/web/core/` | `tsc --noEmit` + `vitest` (단위) |
| `core-io` | `code/web/core-io/` | `tsc --noEmit` + `vitest` (임시 디렉토리 픽스처) |
| `cli` | `code/web/cli/` | `tsc --noEmit` + `vitest` |
| `backend` | `code/web/backend/` | `tsc --noEmit` + `vitest` (단위 + 계약) |
| `frontend` | `code/web/frontend/` | `tsc --noEmit` + `vitest` (단위 + 계약). e2e = `pnpm e2e`(playwright) |
| `scripts` | `scripts/` | `pnpm test:ports` (= `scripts/tests/ports.test.sh`) |
| `src-tauri` | `code/web/src-tauri/` | `cargo check` + `cargo clippy -- -D warnings` |

전체 회귀는 루트에서 **`pnpm verify`** 가 수행한다.

## Contract — 공유 SoT 와 drift-guard

경계를 넘는 공유 타입은 **`code/web/contract/src/index.ts` 의 zod 정의 한 곳**에서만 정의하고 소비처가 파생한다.

- 🔴 **codegen 산출물은 SoT 가 아니다** — 손편집 금지
- 🔴 **drift-guard = codegen 재실행 후 `git diff` 0**

## 프론트엔드 하드룰

- **CSS = Tailwind.** (v4, `@tailwindcss/vite`)
- **아이콘 = Tabler 전용.** `@tabler/icons-react` 외 **다른 아이콘 라이브러리 금지.**
- **폰트 = Pretendard.** (`code/web/frontend/index.html` 로드)
- **끌어 놓기 = dnd-kit.** (`@dnd-kit/core`·`sortable`·`utilities`) HTML5 네이티브 drag 이벤트 사용 금지.
- **긴 목록 가상 스크롤 = TanStack Virtual.** (`@tanstack/react-virtual`)

## 실행 명령

모든 명령은 저장소 루트에서 실행한다. 루트 스크립트는 `code/web` 으로 위임한다.

| 명령 | 목적 |
|---|---|
| `pnpm setup` | 최초 1회 환경 준비(웹 의존성 + macOS Tauri) |
| **`pnpm verify`** | **전체 회귀 — 포트 테스트 + tsc + vitest** |
| `pnpm test` · `pnpm test:ports` | vitest 만 · 포트 해석기만 |
| `pnpm discover <root>` | 로컬 관리대상 프로젝트 발견 |
| `pnpm gootte <step\|board\|next> …` | 계획 조회·단계 배정 |
| `gootte start/end/pause/resume/cancel/drop` | 티켓 시간 기록의 유일한 주체 |
| `pnpm dev` · `dev:tauri` / `build:tauri` / `e2e` | dev 서버·데스크톱 셸·e2e |

## 구조 파악

코드 구조·호출 경로·blast radius 는 grep 이 아니라 **codegraph** 로 묻는다.

```bash
# 편집 전: 영향 범위 파악
codegraph impact <파일>

# 편집 후: 검증할 테스트 찾기  
codegraph affected <파일>

# 동기화 (편집 후)
codegraph sync
```

## 문서 관례

작업 표면은 **`docs/features/<기능>/`** (`spec.md` + `tickets/T<NN>.md` + `adr/`)다.

| 무엇 | 어디 |
|---|---|
| 새 티켓 | `tickets/T<NN>.md` |
| 완료 기록 | `gootte start/end` (state.json v2) |

## taskflow 기반 개발 워크플로우

### 1. 작업 시작
- `bin/fm-spawn.sh` 로 worker 스폰 또는 `tf_spawn` 사용
- 작업은 격리된 worktree에서 진행됨

### 2. 개발 및 검증
- `pnpm verify` 로 검증
- PR 생성 후 `bin/fm-pr-check.sh` 로 검토
- 푸시 후 자동으로 검증을 시작할 수 있음(`tasks.toml`의 verifyCmd 참조)

### 3. 머지
- `pnpm verify` 가 green이면 머지 가능
- `bin/fm-pr-merge.sh` 로 머지 (`yolo` 설정에 따라 자동 머지 가능)

### 4. 청산
- `tf_end` 로 worker 정리
- 작업 완료 후 `state/.status` 에 `finished=` 기록

## 운영 규칙

- **커밋·푸시는 명시 요청 시만.** 외부 전송·삭제·비가역 동작은 확인 후.
- **언어** — 사용자와 같은 언어로 답한다. 이 저장소의 문서 본문은 한국어다(슬러그·식별자는 영문).