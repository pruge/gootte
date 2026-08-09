# firstmate-migration — cling 관례 제거와 firstmate 관리 전환

Status: resolved (2026-08-09) · 열린 결정 전부 캡틴이 닫음 · 티켓 6장 전부 `resolved`

이 사양은 **저장소 층**만 다룬다. 제품이 무엇을 읽을 것인가는 자매 사양
[`../firstmate-project-source/spec.md`](../firstmate-project-source/spec.md) 가 갖는다. 둘의 순서 요구는 §순서.

## 캡틴 지시 (원문)

> 내 작업 디렉토리에 gootte 프로젝트가 추가되었어. 이 프로젝트도 cling을 통해 관리해왓었는데.
> 이제 jinwooauto처럼 firstmate로 관리하게할꺼야.
> 그래서 cling 의 잔재는 모두 삭제, roadmap, mermaid 파일들을 삭제하는 처리를 하자.

열린 결정 4건에 대한 답 (2026-08-09):

> 1. 기능을 새로 계획할꺼야. ai2/projects의 관리하게 전환, features 바라보게 수정.
>    issues 처리할일 목록, ~/.treehouse에서 처리중인 목록을 확인하여 처리중으로 처리.
> 2. 삭제한다.
> 3. 삭제한다. 전부.
> 4. jinwooauto가 어떻게 처리했는지 확인하여 동일하게 처리한다.

상시 권위(캡틴 선호 파일)에서 이 작업에 직접 걸리는 두 줄:

> **cling 계열 전체** … 잠정 중단 (2026-08-06 캡틴 지시).
> **예외 하나: 포트 배정 기능만 계속 쓴다.**

> 캡틴의 근거는 같은 계열이다 — **손으로 갱신하는 두 번째 표현은 낡는다.**

## 문제

gootte 저장소는 cling 관례로 지어졌다. 문서 트리(`docs/roadmap` `docs/todo` `docs/sprint` `docs/mermaid`),
프로젝트 SoT(`.cling/profile.md`), 검사 스크립트(`scripts/mermaid-refs-check.sh`)가 전부 cling 워크플로우를
전제한다. 그 워크플로우는 은퇴했으므로 이 구조는 이제 **아무도 갱신하지 않는 두 번째 표현**이다.
firstmate 로 관리하려면 저장소가 firstmate 가 읽는 모양 — 루트 `AGENTS.md`,
`docs/features/<기능>/{spec.md,adr/,issues/}` — 이어야 한다.

## 실측 (2026-08-09, `main` = `origin/main`, 작업트리 clean)

| # | 사실 | 근거 |
|---|---|---|
| F1 | 제품의 프로젝트 발견 = `<dir>/.cling/profile.md` 존재 여부 | `code/web/core-io/src/discover.ts` `discoverProjects` |
| F2 | 제품이 관리대상에서 읽는 문서 = `docs/roadmap` `docs/todo` `docs/sprint` `docs/mermaid` | `code/web/core-io/src/{load,tree,mermaid}.ts` |
| F3 | **저장소 자신의 `docs/` 는 테스트 픽스처가 아니다.** 테스트는 전부 임시 디렉토리에 합성 픽스처를 쓴다 | `cli.test.ts` `tree.test.ts` `mermaid.test.ts` `app.test.ts` |
| F4 | 따라서 `docs/{roadmap,todo,sprint,mermaid}` 삭제는 `pnpm verify`(`tsc --noEmit` + `vitest run`)에 영향이 없다 | F3 |
| F5 | `scripts/mermaid-refs-check.sh` 는 `pnpm verify` 에 배선돼 있지 않고, 대상 폴더가 없으면 스스로 skip 후 exit 0 | `code/web/package.json` · 해당 스크립트 14행 |
| F6 | **포트 배정은 `.cling/profile.md` 에 의존하지 않는다.** 레지스트리(`~/.cling/ports`) + `port-alloc.sh` 만으로 동작한다. profile 을 읽는 것은 은퇴한 `/cling:worktree` 전용 `port-inject.sh` 뿐 | `~/.cling/bin/` 전체 grep |
| F7 | gootte main 밴드 포트는 레지스트리에 active — backend `8804`, frontend `5304` | `~/.cling/ports` 823–824행 |
| F8 | 포트가 박힌 파일은 2곳 | `code/web/backend/src/server.ts`, `code/web/frontend/vite.config.ts` |
| F9 | **`.cling/profile.md` 는 다른 어디에도 없는 지식의 유일한 보관처다** — 제품 불변식 INV-1~4, contract codegen SoT 정책·drift-guard, 컴포넌트별 verify 기준, frontend 하드룰(Tailwind·Tabler 전용·Pretendard), track 통제 어휘(E/W/R/X), 실행 명령표 | 파일 본문 |
| F10 | 저장소에 `AGENTS.md`·`CLAUDE.md`·`docs/agents/` 가 없다 | 루트 `ls -a` |
| F11 | `.codegraph/` 가 `.gitignore` 에 없어 untracked 로 떠 있다 (jinwooauto 는 26행에서 무시) | `git status --porcelain` |
| F12 | 삭제 후보 규모 — roadmap 52 · todo 37 · sprint 24 · mermaid 8 파일 | `find` 집계 |
| F13 | **mermaid 제품 표면은 8개 파일보다 훨씬 넓다** — contract 타입 3종(`StructureDiagram`/`Group`/`Response`)과 `LineageNodeKind` 의 `"mermaid"` 값, `core/parse/mermaid.ts`, `core/project/structure.ts`, `core-io/mermaid.ts`, backend `GET /api/structure/:slug`, frontend `structure/` 3컴포넌트 + `MermaidBlock` + `Markdown` 연동 + npm `mermaid@^11.16.0` | 각 파일 grep |
| F14 | **jinwooauto 의 포트 격리 방식** — `scripts/ports.sh` 단일 해석기가 `code/web/.ports.worktree`(있으면) → `code/web/.ports.main`(없으면) 순으로 읽는다. 판정은 파일 존재 여부만 본다. 값이 없거나 숫자가 아니면 기본값으로 넘어가지 않고 오류로 멈춘다. 테스트는 `scripts/tests/ports.test.sh` | `jinwooauto/scripts/ports.sh` |
| F14b | **jinwooauto 의 codegraph 관례** = `docs/agents/codegraph/` 아래 크루 진입 파일 `README.md`, 유지보수 근거 `PLAN.md`, 컨텍스트별 `vocabulary/<컨텍스트>.md`. 사전은 **한국어 개념어 → 영문 앵커 + 파일 경로** 표이고 줄번호는 적지 않는다(하루 만에 12줄 중 7줄이 낡은 실측 때문) | `jinwooauto/docs/agents/codegraph/` |
| F14c | 🔴 **그 README 의 첫 절은 "`No results found` 는 코드에 없다는 뜻이 아니다"** 경고다. 낡은 색인도 `status` 는 "up to date" 라고 답한다 — 실제로 실재하는 심볼 둘을 "없다" 고 기록한 사고가 있었다. 없다고 판정하기 전에 grep 교차확인 → 재색인 → 재질의 | 같은 파일 |
| F14d | gootte 의 색인은 살아 있다 — 113파일·916노드·2,263엣지. 컨텍스트는 여섯(`contract` `core` `core-io` `cli` `backend` `frontend`) | `codegraph status` · `code/web/` |
| F14e | jinwooauto 루트 `AGENTS.md` 에는 아직 codegraph 지시가 **없다.** 탐색 순서는 `docs/agents/domain.md` 가 규정한다 | 두 파일 grep |
| F15 | **포트를 정하는 주체는 firstmate 다.** 크루 격리 사본 생성 시 firstmate 가 `code/web/.ports.worktree` 를 써 넣고, 이미 쓰이는 포트나 main 값과 겹치면 거부한다. `.ports.main` 은 tracked, `.ports.worktree` 는 gitignore | `firstmate/bin/fm-worktree-runtime-lib.sh` · `jinwooauto/.gitignore` 9–10행 |

미검증으로 남긴 것: `docs/roadmap` 52문서 각각의 현재 코드 일치 여부는 세지 않았다. D2 가 "삭제" 로
닫혔으므로 이 대조는 더 이상 필요하지 않다.

## 닫힌 결정

| # | 결정 | 답 | 결과 |
|---|---|---|---|
| D1 | 제품의 cling 읽기 기능 | **전환한다** — `ai2/projects` 를 관리하고 `docs/features` 를 바라본다 | 자매 사양 `firstmate-project-source` 로 분리 |
| D2 | `docs/roadmap` | **삭제한다** (이주 아님) | 티켓 03 |
| D3 | mermaid | **전부 삭제한다** — 저장소 8파일 + 제품 표면 전체(F13) | 티켓 05 |
| D4 | worktree 포트 격리 | **jinwooauto 와 동일하게** (F14·F15) | 티켓 07 |

D3 에 딸린 판단 하나도 캡틴이 닫았다(2026-08-09, 분해안 제시에 "ok"): `MermaidBlock` 은 `docs/mermaid`
전용이 아니라 **아무 마크다운 문서 안의 ` ```mermaid ` 코드펜스**도 렌더한다. **그것까지 전부 걷어낸다** —
결과적으로 문서 안 다이어그램은 코드 블록 텍스트로 보인다.

## 불변식

- **INV-A — 삭제 전에 이전한다.** 어떤 파일이 유일하게 갖고 있는 지식은 삭제 티켓보다 **앞선 티켓에서**
  `AGENTS.md` 로 옮겨져 있어야 한다. 이 순서가 깨지면 삭제가 곧 지식 소실이다(F9).
- **INV-B — 포트 배정은 계속 산다.** 캡틴이 cling 에서 유일하게 남긴 기능이다. 다만 배정 주체는
  `~/.cling/ports` 레지스트리에서 **firstmate 로 옮겨간다**(F15) — 이것이 D4 의 실제 내용이다.
- **INV-C — 각 티켓 끝에서 `pnpm verify` green.** 문서 삭제라도 예외 없다.
- **INV-D — 이 사양은 제품의 *읽기 대상*을 바꾸지 않는다.** 티켓 05(mermaid)만 `code/` 를 건드리고,
  그것은 기능 제거지 대상 변경이 아니다. 대상 변경은 자매 사양이 소유한다.
- gootte 제품 불변식 INV-1~4 는 `AGENTS.md` 로 자리만 옮긴다. 내용은 이 작업이 바꾸지 않는다.

## 티켓

세로 슬라이스가 아니라 **확장 → 이주 → 축소**다. 저장소 전체에 걸친 구조 변경이라 잘라 놓으면
중간 상태가 지식 구멍이 된다(캡틴 분해 규율 2항).

| # | 티켓 | 단계 | Blocked by | 모델 |
|---|---|---|---|---|
| 01 | **firstmate 저장소 모양 세우기** — `.cling/profile.md` 의 durable 지식(F9 6항목)을 루트 `AGENTS.md` 로 (+ `CLAUDE.md` 심링크), `docs/agents/` 문서 관례(`Status:` 여덟 값·티켓 서식·ADR 어휘·탐색 순서), `.gitignore` 에 `.codegraph/` | 확장 | — | **강** |
| 02 | **codegraph 사전 세우기** — `docs/agents/codegraph/{README.md,PLAN.md,vocabulary/*.md}` 를 jinwooauto 와 같은 모양으로. 여섯 컨텍스트(F14d), 실제 질의로 미리 채움 | 확장 | — | 보통 |
| 03 | `docs/roadmap` 52 + `docs/todo` 37 + `docs/sprint` 24 파일 삭제 + `docs/README.md`(cling IA 맵)를 firstmate 문서 지도로 교체 | 축소 | 01 | 보통 |
| 04 | mermaid 전부 삭제 — 저장소 8파일 + `scripts/mermaid-refs-check.sh` + F13 의 제품 표면 + npm 의존 | 축소 | 01 | **강** |
| 05 | 포트를 jinwooauto 방식으로 — `scripts/ports.sh` + `code/web/.ports.main`(8804/5304, tracked) + `.ports.worktree` gitignore + `scripts/tests/ports.test.sh` + dev 스크립트가 해석기를 읽게 | 확장 | 01 | 보통 |
| 06 | `.cling/` 삭제 | 축소 | 03,04,05 · **자매 사양 01** | 보통 |

**01 이 구조를 처음 세우는 티켓**이다. 강한 모델을 배정하고 완료 조건에
**"AGENTS.md 의 구조와 이후 확장 절차를 문서로 남긴다"** 를 반드시 포함시킨다. 빠뜨리면 02 이후가
코드를 역추적하게 되고 다시 강한 모델이 필요해진다.

**04 가 강한 모델인 이유**: contract 타입 제거는 codegen drift-guard 를 통과해야 하고,
`LineageNodeKind` 에서 `"mermaid"` 값을 빼는 것은 lineage 그래프 전체에 파급된다.

**02 를 채울 때의 함정**: 크루의 격리 사본에는 `.codegraph/` 색인이 없을 수 있다(jinwooauto 격리 사본
5개 중 4개가 그랬다). 메인 작업 사본의 색인을 `-p` 로 가리켜 질의하거나, 그 사본에서 먼저 색인을 만든다.
그리고 F14c 의 경고를 README 맨 위에 그대로 세운다 — 그 절이 없으면 사전 자체가 "없다" 는 오판을
기록하는 장치가 된다.

## 🔴 순서 — 위험한 방향은 하나다

`.cling/profile.md` 가 사라지는 순간 gootte 는 **자기 대시보드에서 사라진다**(F1 — 발견 규칙이 그 파일을 본다).

따라서 **티켓 06(`.cling/` 삭제)은 자매 사양의 발견-규칙 전환 티켓(01)이 착지한 뒤에만** 착지한다.
반대 방향(발견 규칙을 먼저 바꾸고 `.cling/` 을 나중에 지우는 것)은 안전하다 — 잠깐 두 규칙이 공존할 뿐이다.

둘을 한 티켓으로 합치지 않는다. 합치면 이 사양의 나머지 축소 작업이 자매 사양의 구현 속도에 묶인다.

## 범위 밖

- 제품이 무엇을 읽는가 — 발견 규칙, `docs/features` 파싱, 처리중 판정. **전부 자매 사양이 소유한다.**
- 관리대상 프로젝트들의 문서, gootte 가 생성하는 `.gootte/` 산출물.
- gootte 를 firstmate 프로젝트로 **등록**하는 절차 자체 — firstmate 쪽 일이다.
- `~/.cling/ports` 레지스트리 정리 — 티켓 07 이 gootte 를 그 레지스트리에서 떼어내지만, 레지스트리 자체는
  다른 프로젝트가 아직 쓴다.

## 검증

문서 삭제가 대부분이라 이음매가 얇다. **억지로 만들지 않는다.** 대신 완료 조건을 관측 가능하게 못박는다.

| 티켓 | 완료 조건 |
|---|---|
| 01 | `AGENTS.md` 가 F9 의 6항목을 전부 담는다(원문 대조). `git status --porcelain` 에 `.codegraph/` 가 없다 |
| 02 | 사전의 모든 항목이 **실제 질의 결과 그대로**여야 한다 — 지어낸 앵커 0. 무작위 3항목을 `grep` 으로 교차확인해 파일 경로가 맞는지 본다. 줄번호가 적힌 항목 0 |
| 03, 06 | ① `pnpm verify` green — F4·F5 로 **영향 없음이 예측된다. 다르면 예측이 틀린 것이므로 멈추고 보고한다** ② `git grep -rn cling -- . ':!code'` 잔량이 그 티켓이 남기기로 한 집합과 정확히 일치 |
| 04 | `pnpm verify` green + contract codegen 재실행 후 `git diff` 0 + `git grep -rni mermaid` 잔량 0 + `code/web/frontend/package.json` 에 mermaid 의존 없음 |
| 05 | `scripts/tests/ports.test.sh` green (jinwooauto 것을 이식). `.ports.main`·`.ports.worktree` 둘 다 없을 때 **조용한 기본값 없이 오류로 멈추는지**를 반드시 포함 — 이것이 그 스크립트 설계의 핵심이다 |

현재 커버리지 공백: `docs/` 구조 자체를 검증하는 테스트는 **없고, 이 작업이 만들지도 않는다.**
firstmate 관리 아래에서는 `AGENTS.md` 가 그 역할을 하고, 그것은 테스트가 아니라 읽히는 문서다.
포트는 예외 — 07 이 이식하는 테스트가 그 공백을 처음 메운다.
