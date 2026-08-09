# Domain docs — 이 저장소를 탐색하기 전에 읽는 순서

엔지니어링 스킬과 작업자가 이 저장소를 탐색할 때 무엇을 어떤 순서로 읽어야 하는지.

이 저장소는 **단일 TS 모노레포**(`code/web/`, pnpm workspace)이고 컨텍스트가 **여섯** 있다.
언어가 하나라서 겉보기에는 평평하지만, **순수 계층과 IO 계층이 갈려 있는 것**이 이 코드베이스의 뼈대다
(아래 §컨텍스트).

## 이 순서로 읽는다

1. **🔴 제품 불변식 — 최우선.** [`AGENTS.md`](../../AGENTS.md) 의 `INV-1` ~ `INV-4`.
   건드릴 영역에 해당하는 것이 있으면 설계에 반영하고 spec·티켓에 명시한다. 선택이 아니라 의무다.
   빠른 판단: 새 파일을 쓰려 한다 → INV-1·2 / 캐시·스냅샷 → INV-1·3 / 요약·추론 → INV-4.

2. **진행 상태** — `docs/features/<기능>/` 티켓의 `Status:` · `Blocked by:` frontier 가
   "지금 무엇이 참인가 · 다음 순서는 무엇인가" 의 **유일한** 답이다. 별도 원장은 없다
   ([`issue-tracker.md`](issue-tracker.md)).

3. **결정(ADR)** — 그 결정이 속한 `docs/features/<기능>/adr/NNNN-*.md`.
   "건드릴 영역 → 관련 기능 → 그 폴더의 `adr/`" 로 좁혀 읽는다.

4. **계약 코드** — `code/web/contract/src/index.ts`. 이 저장소의 **어휘 SoT** 다.
   상태 모델·digest 스키마·CLI 출력 타입이 전부 여기 zod 로 있다.
   🔴 **문서와 계약 코드가 어긋나면 계약 코드가 이긴다.**

5. **코드 구조** — grep 이 아니라 codegraph 로 묻는다:
   `codegraph explore "<심볼 또는 질문>" -p code/web`. 한국어 개념어에서 출발할 때는
   [`codegraph/`](codegraph/) 의 사전을 먼저 본다.

## ⚠️ 옛 문서에서 어휘를 줍지 않는다

은퇴한 워크플로우가 남긴 문서(`docs/mermaid/` · `.cling/profile.md` — 둘 다 걷어내는 중)는
동결된 역사로만 읽는다. 검색 결과에 걸려 나온 그 문서들은 **단서지 권위가 아니다** — "accepted" 라고
적혀 있어도 지금 유효하다는 뜻이 아니다. 신선도 판정은 위 2·4번(티켓 frontier, 계약 코드)이 한다.

## 컨텍스트 (여섯)

| 컨텍스트 | 경로 | 무엇 | 성질 |
|---|---|---|---|
| `contract` | `code/web/contract/` | zod 공유 타입 SoT (`@gootte/contract`) | 의존 없음(zod 만) |
| `core` | `code/web/core/` | 문서 파싱(`parse/`) · 상태(`state/`) · projection(`project/`) | 🔴 **순수 — 부수효과 0** |
| `core-io` | `code/web/core-io/` | fs read · discover · git · watch · emit | 🔴 **IO 전담** |
| `cli` | `code/web/cli/` | `gootte` CLI + agent-skill (`src/skill/SKILL.md`) | core + core-io 조립 |
| `backend` | `code/web/backend/` | Hono API + 실시간(`live.ts`) | core-io 를 통해서만 fs 접근 |
| `frontend` | `code/web/frontend/` | React + Vite 대시보드 | contract 만 import(서버 경유) |

### 🔴 `core` 와 `core-io` 가 갈려 있는 이유

**`core` 는 순수하다 — 파일을 읽지 않고 시계를 보지 않는다.** 문자열과 데이터를 받아 데이터를 낸다.
**`core-io` 가 바깥 세상 전부**를 맡는다 — 파일 읽기, 프로젝트 발견, git, 파일 감시, `.gootte/` 산출물 emit.

이 분리는 편의가 아니라 **INV-4(read-path 는 결정적·LLM-free)를 컴파일 시점에 강제하는 장치**다.
`core` 안에서 `node:fs` 를 import 하고 싶어지면 그건 그 로직이 `core-io` 쪽이라는 신호다 — 경계를 넘기지
말고 IO 를 `core-io` 에 두고 순수 함수에 데이터를 넘긴다. 테스트가 이 분리에 기대고 있다:
`core` 는 픽스처 문자열로, `core-io` 는 임시 디렉토리로 테스트한다.

## 🔴 쓰기 규칙 — 어디에 쓰나

읽기 경로와 쓰기 경로는 다르다. **은퇴한 문서(위 ⚠️ 절)에는 한 글자도 새로 쓰지 않는다.**

| 쓰는 것 | 위치 |
|---|---|
| spec·티켓 | `docs/features/<기능>/` ([`issue-tracker.md`](issue-tracker.md)) |
| 새 ADR | `docs/features/<기능>/adr/NNNN-<slug>.md` — 그 결정이 속한 기능 폴더 안 |
| 진척·상태 | 그 기능 폴더 안 (spec.md 의 `## Progress` · 티켓의 `Status:` 줄) |
| 저장소 전체에 걸리는 지침 | [`AGENTS.md`](../../AGENTS.md) (§Maintaining this file 의 절차를 따른다) |
| 문서 관례 자체 | 이 폴더 `docs/agents/` |
| 한국어 개념어 → 코드 앵커 | [`codegraph/vocabulary/`](codegraph/) — 헛짚었을 때만 append |

기존 결정을 뒤집을 때는 옛 파일을 고치는 게 아니라 **새 ADR 에 무엇을 뒤집는지 적는다.**

## 이 저장소가 쓰는 용어를 쓴다

출력이 도메인 개념을 지칭할 때(티켓 제목, 리팩터 제안, 가설, 테스트 이름) 이 저장소가 실제로 쓰는 용어를 쓴다.
어휘의 SoT 는 `code/web/contract/src/index.ts` 다 — `initiative` · `lineage` · `supersede` · `digest` ·
`track` · `frontier` 같은 말이 거기서 정의된 대로 쓰인다.

주의할 이름 겹침이 하나 있다: **`track`** 은 (1) 제품이 관리대상 문서에서 파싱하는 대분류이자
(2) 이 저장소 자신의 통제 어휘(E/W/R/X, `AGENTS.md` §Track)이다. 어느 쪽을 말하는지 문맥에서 분명히 한다.

필요한 개념이 어디에도 정의돼 있지 않다면 그건 신호다 — 이 프로젝트가 쓰지 않는 언어를 지어내고 있거나,
진짜 공백이거나(그렇다면 티켓으로 기록).

## 불변식과 충돌하면 드러낸다

출력이 기존 ADR 이나 불변식과 모순되면 **조용히 덮어쓰지 말고 명시적으로 드러낸다**:

> _INV-2(관리대상은 읽기 전용)와 충돌 — 그럼에도 재론할 가치가 있는 이유는…_
