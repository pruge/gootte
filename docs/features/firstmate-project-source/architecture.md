# 발견·파싱 계층의 구조 — 새 문서 종류를 하나 더 읽으려면

티켓 01 의 완료 조건. 티켓 02(할일 목록)·03(처리중)이 코드를 역추적하지 않아도 되도록,
**지금 계층이 어떻게 갈라져 있고 새 문서 종류가 어디를 지나가는지**를 적는다.
사양 본문은 [`spec.md`](spec.md), 이 문서는 그 아래 구현 지형도다.

## 계층

경계는 **하나뿐**이다 — 순수 계산이냐, 파일시스템·git 을 만지느냐(F11).

| 패키지 | 무엇이 산다 | 무엇이 살면 안 된다 |
|---|---|---|
| `contract/` | zod 스키마 = 공유 타입 SoT. 여기서 파생되지 않은 API 형태는 없다 | 로직 |
| `core/` | **순수**. `parse/`(문자열 → 구조), `state/`(구조 → ProjectState), `project/`, `rank.ts` | `node:fs`·`node:child_process`·`Date.now()` 같은 환경 접촉. 지금 `core/` 에 fs import 는 **0개**이고 그대로 유지한다 |
| `core-io/` | **파일시스템·git**. 어떤 디렉토리가 프로젝트인지, 어떤 파일을 읽는지, git 이 뭐라고 하는지 | 파싱 규칙. 읽어온 문자열은 `core/` 파서에 넘긴다 |
| `backend/` | Hono 라우트 = CORE 산출물을 CONTRACT 봉투에 실어 서빙. `discover-cache.ts` 는 discover TTL 캐시 + slug 해소 | 계산·파싱 |
| `frontend/` | TanStack Query(서버상태 SoT) + 뷰 | 파생값 재계산·중복 스토어(INV-1) |
| `cli/` | 같은 core/core-io 를 텍스트로 뽑는 얇은 표면 | 자체 로직 |

`core-io/` 안의 역할 분담 — **읽는 이유가 다르면 파일이 다르다**:

| 파일 | 답하는 질문 |
|---|---|
| `discover.ts` | **이 디렉토리가 프로젝트인가**, 그리고 어디를 훑는가 |
| `load.ts` | 프로젝트 하나를 통째로 읽어 `ProjectState` 를 만든다(IO 오케스트레이션) |
| `doc.ts` · `tree.ts` | 문서 브라우저가 **파일 한 장**을 읽는다(traversal 가드 포함) |
| `git.ts` · `worktree.ts` | git 이 말해주는 것 — 신호, 격리 사본 목록 |
| `treehouse.ts` | **누가 지금 무엇을 붙들고 있나** — `~/.treehouse` 슬롯의 브랜치/detached 와 그 가지가 건드린 경로(티켓 03) |
| `watch.ts` | 변경 감시 → 이벤트(INV-3 의 stale 금지가 여기 붙는다) |

## 지금 발견 규칙 (티켓 01 이후)

`discover.ts` 가 **뿌리 + 2단계 하위**를 훑고, 디렉토리마다 두 판정을 OR 로 건다.

- `isFirstmateProject(dir)` — 루트 `AGENTS.md` **와** `docs/features/` 가 둘 다 있음.
- `isClingProject(dir)` — `.cling/profile.md` 가 있음. **은퇴 예정** — 티켓 04 가 이 갈래와
  그에 매달린 파싱 경로를 함께 지운다. 그때까지는 공존한다.

**둘 다 요구하는 이유**(사양 §설계 1 과 같은 말):
`AGENTS.md` 만 보면 firstmate 저장소 자신과 `~/.treehouse` 아래 격리 사본이 전부 딸려 들어오고,
`docs/features/` 만 보면 아직 firstmate 관리가 아닌 저장소가 섞인다. 한쪽만으로는 목록이 거짓말을 한다.

스캔 뿌리 기본값은 `defaultProjectRoots()` 한 곳에서만 정한다 — `~/Documents/ai2/projects`.
덮어쓰기는 호출자 몫이다: backend 는 `GOOTTE_ROOTS`(콜론 구분), cli `discover` 는 인자.
**기본값을 다시 하드코딩하지 말고 이 함수를 부른다.**

## 새 문서 종류를 하나 더 읽는 절차

티켓 02 의 `docs/features/<기능>/issues/<NN>-<슬러그>.md` 가 이 절차를 처음 밟는다.
순서대로 밟으면 계층 경계가 저절로 지켜진다.

1. **`contract/src/index.ts`** — 그 문서에서 나온 값이 API 를 건너간다면 zod 스키마를 먼저 늘린다.
   화면이 쓸 어휘를 여기서 못 박는다(예: 원문 상태를 한 칸 더 싣는 결정 Q3).
2. **`core/src/parse/<새문서>.ts`** — 문자열 → 구조. **순수 함수**로 쓰고
   `core/src/parse/index.ts` 에 export 를 한 줄 더한다. 단위 테스트는 옆에 두고
   fs 없이 인라인 문자열로 먹인다(`parse.test.ts` 형태).
3. **`core/src/state/`** — 그 문서가 `ProjectState` 에 실려야 할 때만. `StateInput` 을 늘리고
   `buildState` 에서 조립한다. **막힘 해제 같은 파생값은 저장하지 말고 여기서 계산한다**(INV-1).
4. **`core-io/`** — 읽는 이유에 맞는 파일을 고른다.
   - 판정이 바뀐다(무엇이 프로젝트인가) → `discover.ts`
   - 프로젝트 로드에 같이 실린다 → `load.ts` 에서 read 하고 2번 파서에 넘긴다
   - 브라우저가 한 장씩 연다 → `doc.ts` / `tree.ts` (**traversal 가드 필수**)
   - git 이 입력이다 → `git.ts` / `worktree.ts`
   테스트는 임시 디렉토리 픽스처로 같은 폴더에 둔다(`discover.test.ts` · `tree.test.ts` 형태).
5. **`backend/src/app.ts`** — 화면이 새 라우트를 필요로 할 때만 라우트 + 봉투 `parse` 를 더한다.
   `discover-cache.ts` 는 **발견 의미가 바뀔 때만** 건드린다(캐시 키는 roots 문자열이다).
6. **`frontend/src/lib/api.ts` + `lib/query.ts`** — fetch 함수와 쿼리 키를 더하고 뷰에서 쓴다.
   서버상태를 별도 스토어에 복제하지 않는다.

### 어느 이음매에 테스트를 두는가

| 무엇 | 어디 | 왜 |
|---|---|---|
| 파싱·상태·계산 규칙 | `core/**/*.test.ts` (순수) | 규칙 자체가 순수 함수다. 여기서 깨지면 위 어디서도 못 산다 |
| 발견·파일 판정·git 상태 | `core-io/**/*.test.ts` (임시 디렉토리·임시 repo) | 파일시스템이 입력이다 |
| 라우트 응답 형태 | `backend/test/app.test.ts` | 봉투가 계약대로인지 |
| 화면 | `frontend/test/*.tsx` 최소 1개 | 목록이 뜨는지까지. 그 이상은 깨지기 쉽다 |

### 밟지 말 것

- `core/` 에 `node:fs` 를 들이는 것. 순수 계층이 사라지면 3·4번의 분업이 무너진다.
- `core-io/` 에 파싱 규칙을 적는 것. 읽기와 해석이 붙으면 규칙을 fs 없이 테스트할 수 없다.
- 관리대상 문서에 쓰는 것 — **INV-2**. 이 제품은 `docs/features/` 아래를 **읽기만** 한다.
  처리중 표시를 티켓 파일에 적어 넣는 것도 여기 포함된다.
- 파생값을 저장해 두 번째 SoT 를 만드는 것 — **INV-1**. 볼 때마다 다시 계산한다.
- 이름이 비슷하니 아마 이것이겠거니 하는 추정 — **INV-4**. read-path 는 결정적이다.
- 이을 수 없는 것을 조용히 빠뜨리는 것. 매핑 실패는 **세어서 드러낸다**(티켓 03 §미상).
  빠진 목록은 화면에서 "아무도 아무것도 안 하는 중" 이라는 거짓말이 된다.
- 🔴 **읽기 실패를 "없음" 으로 접는 것.** git 이 답하지 않은 사본을 detached(유휴)와 같은 값으로
  합치거나 저장소를 못 찾은 슬롯을 건너뛰면, 실제로 돌고 있는 작업이 **세어지지도 않고** 사라진다 —
  미상을 감추는 것보다 더 조용하다. "모른다" 는 "아니다" 와 **다른 값**이어야 한다.

## 문서가 아닌 입력 — 격리 사본 관측 (티켓 03 이후)

같은 계층 규율이 git 입력에도 그대로 적용된다. 문서 절차의 2·4번이 이렇게 대응된다.

| 계층 | 무엇 |
|---|---|
| `contract/` | `InProgressSummary` · `UnmappedWork` · `FeatureTicket.workedBy` |
| `core/parse/ticket-path.ts` | 경로 문자열 → 티켓 참조. **어느 작업이 어느 티켓인가의 유일한 규칙**(안 B) |
| `core/project/in-progress.ts` | 사본 관측 + 할일 목록 → 처리중 표시·미상 집계(순수) |
| `core-io/treehouse.ts` | 사본이 어디 있고 브랜치 위인지, 그 가지가 어떤 경로를 건드렸는지(날것만) |
| `backend/app.ts` | 뿌리 해소(`GOOTTE_TREEHOUSE`) + 두 입력을 봉투에 실어 서빙 |

뿌리 기본값은 `defaultTreehouseRoot()` 한 곳에서만 정한다 — `~/.treehouse`. 덮어쓰기는 호출자 몫이다
(backend `GOOTTE_TREEHOUSE`). **기계마다 다르므로 경로를 다시 하드코딩하지 않는다.**
