# codegraph 질의어 사전 — 운영 계획

> 근거: `docs/features/firstmate-migration/issues/02-codegraph-vocabulary.md`,
> `docs/features/firstmate-migration/spec.md` F14b~F14d. jinwooauto 의 같은 사전
> (`~/Documents/ai2/projects/jinwooauto/docs/agents/codegraph/`)을 모양으로 삼았다.

## 왜 필요한가

gootte 의 `code/web/` 에는 `.codegraph/` 색인이 있지만(이 작업 중 `codegraph init code/web` 로
직접 만들어 확인: 113 파일·916 노드·2,263 엣지 — spec F14d 의 실측과 일치), **노드 종류가 전부
코드다** — `import`·`function`·`interface`·`constant`·`type_alias` 등. 문서 의미 노드가 없다.
즉 codegraph 는 **영문 식별자로만 말한다.**

크루는 티켓·스펙의 한국어 개념어("실시간 저장소", "프로젝트 발견")는 알아도 그것이 코드에서
`LiveHub`/`discoverProjects` 로 불린다는 것은 모른다 — 그 사이를 잇는 사전이 없는 게 문제다.

## 채택한 구조

```
docs/agents/codegraph/
├── PLAN.md          이 문서 — 운영 계획·기준. 크루는 안 읽어도 됨(유지보수자용).
├── README.md        🔴 진입 파일 — 크루가 이것 하나만 읽고 codegraph 를 쓸 수 있어야 함
└── vocabulary/      검증된 한국어 개념어 ↔ 영문 심볼 사전. 워크스페이스(컨텍스트)별로 분할
    ├── contract.md   code/web/contract — 공유 타입 SoT
    ├── core.md       code/web/core — 순수 파싱/상태 계산
    ├── core-io.md    code/web/core-io — 파일시스템·git·워크트리 I/O
    ├── cli.md        code/web/cli — CLI 배선
    ├── backend.md    code/web/backend — Hono 서버 + 실시간 허브
    └── frontend.md   code/web/frontend — React UI
```

**사용법과 데이터를 나눈 이유**: `README.md`(안정적)와 사전(계속 커짐)은 갱신 주기와 저자가 다르다
— 크루가 항목을 추가할 때 사용법 설명을 건드릴 필요가 없어야 diff 가 깨끗하다. `PLAN.md` 는
"왜 이렇게 만들었나"의 기록이라 크루 워크플로우에서는 빠진다.

**사전을 컨텍스트로 쪼갠 이유**: gootte 는 pnpm 워크스페이스 6개(`contract`·`core`·`core-io`·
`cli`·`backend`·`frontend`, spec F14d)로 나뉜 monorepo 이고, 그 경계가 곧 codegraph 색인의
파일 구조다. 동시에 진행되는 `fm/*` 브랜치들이 서로 다른 워크스페이스를 건드리면 사전 줄 추가가
충돌하지 않는다는 부수 효과도 있다.

🔴 **쪼갤 때 생기는 함정과 그 대책**: 크루는 "심볼이 어느 워크스페이스에 있는지" 를 모르기 때문에
사전을 찾는다. 그런데 파일이 컨텍스트로 갈리면 **답을 알아야 파일을 고를 수 있는 순환**이 생긴다.
그래서 README 는 파일을 고르게 하지 않고 **`vocabulary/` 디렉토리 전체를 grep** 하게 한다.
읽기는 grep 이 흡수하고, 쓰기는 위치 경로가 파일을 기계적으로 결정한다 — 크루가 판단할 것이 남지
않는다.

**한 심볼이 두 컨텍스트에 걸치면** 형(type)을 소유한 쪽에 적고 비고로 다른 구현을 가리킨다.
예: `ConflictRisk`(타입, `contract`)와 그 값을 계산하는 `conflictRisk`(함수, `core-io/src/git.ts`)
— 타입은 `contract.md` 에, 계산 함수는 비고에서만 가리킨다. 양쪽 복사는 금지다 — 두 줄이 따로
썩는다.

## 항목 서식 (사전 표 컬럼 — 모든 `vocabulary/*.md` 공통)

| 컬럼 | 의미 |
|---|---|
| 한국어 개념어 | 크루가 티켓/스펙/대화에서 실제로 쓰는 말. 질의할 때 이 열을 찾아온다 |
| 영문 앵커 | `codegraph query`/`explore` 에 넣을 실제 심볼/구문. **반드시 검증된 것만** |
| 종류 | function / interface / constant / type_alias 등 (`codegraph query` 출력 그대로) |
| 위치 | **파일 경로만.** 줄번호는 적지 않는다 — 하루 만에 썩는다(jinwooauto 실측: 12줄 중 7줄).
줄은 `grep -n` 이나 `codegraph node` 로 그때 뽑는다 |
| 확인일 | `YYYY-MM-DD` — 신선도 판단용 |
| 비고 | 동명이인 여부, 관련 컨텍스트, 실패했던 짐작 형태 등 |

## 무엇을 남기고 무엇을 버리는가

- **남긴다**: `codegraph query` 로 **실제 결과가 나오고**, 동시에 크루가 먼저 시도했을 법한
  이름(`RealtimeStore`, `LiveStore`, `buildApp`, `findProjects` 등)으로는 **걸리지 않는** 개념어
  ↔ 영문 심볼 쌍. 헛짚었을 때만 남긴다는 티켓 규율(§완료 조건)을 이 계획 작성 중 그대로 시연했다 —
  아래 §미리 채운 첫 항목 후보 참고.
- **버린다(적지 않는다)**: 🔴 **교차확인과 재색인까지 마친 뒤에도** 없는 이름. `No results found`
  하나만으로 버리면 안 된다 — README §먼저 의 사고가 그 근거다. 순서는 grep/Read 교차확인 →
  `codegraph index` 재색인 → 재질의이고, 그래도 없을 때만 버린다.
- **한 번에 맞는 이름은 적지 않는다**: 예를 들어 `ZoomPan`(한국어 "줌팬")처럼 개념어와 영문 이름이
  거의 그대로 일치하는 경우는 굳이 사전에 없어도 대부분 한 번에 맞는다. 이번엔 "다이어그램
  확대/축소" 라는 더 자연스러운 첫 질의(→ `PanZoom`/`DiagramViewer` 로 짐작하기 쉬움)가 실패하는
  걸 확인했기 때문에 남겼다.
- **크루가 자기 PR 안에서 추가**: 크루는 격리된 워크트리에서 일하므로 자기 PR 밖에 쓸 수 없다.
  새로 검증한 항목은 **기능 커밋과 분리된 단독 커밋**으로 자기 PR 에 실어 보낸다 — 절차는
  [`README.md`](README.md) §사전에 한 줄 남기기가 갖는다. 기능 커밋에 섞으면 리뷰에서 보이지
  않고, 그 PR 이 엎어지면 검증된 사전 지식까지 같이 사라진다.

## 미리 채운 첫 항목 후보 — 검증 세션 기록

이 작업 중 이 워크트리에서 `codegraph init code/web` 로 색인을 만든 뒤(§왜 필요한가 — 113 파일·
916 노드·2,263 엣지, spec F14d 와 일치), `codegraph query`/`grep` 을 직접 돌려 확인했다.
크루가 자연스럽게 먼저 시도할 법한 이름으로 질의해 **실패를 재현**하고, 그다음 실제 심볼을
찾아 grep 으로 교차확인한 것만 [`vocabulary/`](vocabulary/) 로 옮겼다.

| 개념어 | 먼저 짐작해 실패한 이름 | 실제 심볼 | 확인 |
|---|---|---|---|
| 실시간 이벤트 허브 | `RealtimeStore`, `LiveStore` | `LiveHub` / `createLiveHub` (`backend/src/live.ts`) | query 실패 재현 + grep |
| 프로젝트 발견 | `findProjects`, `scanProjects`, `ProjectDiscovery` | `discoverProjects` (`core-io/src/discover.ts`) | query 실패 재현 + grep |
| 리니지 계산 | `LineageGraph`, `computeLineage`, `LineageBuilder` | `buildLineage` (`core/src/state/lineage.ts`) | query 실패 재현 + grep |
| 다이제스트 쓰기(CLI) | `runCli`, `cliMain`, `DigestWriter` | `writeDigest` (`cli/src/commands.ts`) → 내부에서 `emitDigest` 호출 | query 실패 재현 + grep |
| 앱 생성(라우팅 조립) | `buildApp`, `AppServer`, `getDefaultRoots` | `createApp` (`backend/src/app.ts`) | query 실패 재현 + grep |
| 충돌 위험도 | `RiskLevel`, `ConflictLevel` | `ConflictRisk`(타입, `contract/src/index.ts`) — 계산은 `conflictRisk()` (`core-io/src/git.ts`) | query 실패 재현 + grep |
| 다이어그램 확대/축소 | `PanZoom`, `DiagramViewer` | `ZoomPan` (`frontend/src/components/common/ZoomPan.tsx`) | query 실패 재현 + grep |

여섯 컨텍스트 파일 각각 한두 줄로 시작한다 — 티켓 규율(모든 개념어를 채우려 하지 않는다)에
따라 의도한 결과다.

## 신선도 유지

- `.codegraph/` 는 머신-로컬(`.gitignore` 대상, 티켓 01 이 처리)이고 **자동 재빌드 훅이 없다.**
  크루가 `codegraph sync code/web` 을 세션 시작 시 스스로 돌려야 색인이 최신이다.
- 🔴 **`codegraph status` 로는 그것을 확인할 수 없다.** jinwooauto 에서 부분적으로 낡은 색인에도
  "up to date" 라고 답한 실측이 있었다(README §먼저). **색인 신선도의 유일한 근거는 코드 자체와의
  교차확인**이고, 어긋나면 `codegraph index code/web` 으로 재색인한다.
- 사전 항목은 **검증 가능한 형태로 적으므로**(영문 앵커 + 위치) 심볼이 바뀌면
  `codegraph query "<영문 앵커>" -p code/web` 이 즉시 `No results found` 로 알려준다 — 그 항목은
  발견한 사람이 삭제하거나 새 이름으로 갱신한다. 별도 만료 주기는 두지 않는다 — 기계적으로
  검증 가능한 것에 시간 기반 규율을 얹는 것은 낭비다.

## 크루의 발견 경로 / 범위 밖

- 루트 `AGENTS.md` 에 이 사전을 가리키는 줄을 넣는 일은 이 작업의 범위 밖이다 — 티켓 01 이
  담당한다(spec F14b, 티켓 02 §이 티켓이 하지 않는 것).
- 사전을 모든 개념어로 채우는 일도 범위 밖이다. 헛짚었던 것만 적는 것이 이 사전의 규율이고,
  이 작업은 그 씨앗만 놓는다.
- jinwooauto 의 사전 수정은 이 작업의 범위 밖이다 — 읽기 전용 참고 모델일 뿐이다.

## 산출물

이 계획(`PLAN.md`) + 진입 파일(`README.md`) + 첫 7개 항목이 채워진 사전(`vocabulary/` 6개 파일).
