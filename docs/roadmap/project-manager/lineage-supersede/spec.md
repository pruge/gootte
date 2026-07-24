# spec — lineage-supersede · phase 1 보강 (TBD 제로)

> blueprint 종속. 전체·seam·불변식 = [../blueprint.md](../blueprint.md). 구조 = [M-0001](../../../mermaid/INDEX.md#M-0001).

## Goal
cling 문서의 **supersede·drop·spawn·타임라인** 데이터를 파싱해 `LineageNode/Edge` 를 채우고, `gootte plan` rationale + **`gootte lineage`** 텍스트 뷰로 표면화. **결정적·verbatim**(LLM 없음). = "어느 시점에 왜 다시 kickoff·drop된 것·새로 개발할 것" 을 실제 데이터로.

## Architecture (blueprint 소비)
[M-0001]. phase 1 spine(순수 CORE + IO + CONTRACT) 재사용. **확장만**: contract(LineageEdge/TodoItem 필드) · core(parse supersession/resolvedBy + state lineage 채움 + render lineage) · core-io(load 가 ADR 읽어 배선) · cli(lineage 명령).

## Components (영향/신규)
| 컴포넌트 | 변경 |
|---|---|
| `web/contract` | **확장** — `LineageEdge`(kind·note·adr) · `TodoItem`(resolvedBy·source) · 신규 `Supersession`·`TimelineEvent`·`DropRecord` |
| `web/core` | parse(`parseIndex` supersession · `parseTodo` resolvedBy/source) · **state(`state/lineage.ts` — lineage 채움 + drops; build.ts 호출)** · render(`renderLineage` + plan rationale 확장) |
| `web/core-io` | `load` 가 `adr/*.md`·`adr/_superseded/` 읽어 buildState 에 전달 |
| `web/cli` | `gootte lineage <proj>` 명령 |

## Invariants (프로파일 verbatim + 신규)
- **INV-1** projection 재생성 파생물. **INV-2** 읽기 전용(`.gootte/`만 write). **INV-3** 항상 현재 반영.
- **INV-4 (신규 — 프로파일 추가 제안)** — **gootte read-path(plan/lineage/digest 생성)는 결정적·LLM-free.** 산문 "왜"는 요약 말고 **verbatim 릴레이**. 지능(왜 판단)은 write-time(cling 세션 AI)이 캡처, read-time 은 계산·릴레이만. (ADR-0002)

## Scope / Non-goals
- **scope**: lineage 채움(supersede/partial/reference/spawn/dep/drop) + `gootte plan` 표면화 + `gootte lineage` 텍스트.
- **non-goal**: **타임라인 채움**(=phase 2, W1) · 시각 supersede 그래프·Gantt(phase 2 웹) · LLM 합성 · write-time 캡처(external-writer seam=별 후속).

## Data Model / Contracts (blueprint seam 확장 — 재등록 X)
```
LineageEdge (확장)  { from, to, kind: supersede|supersede-partial|spawn|dep|reference,
                      note?: string /* verbatim 왜 */, adr?: string[] }
TodoItem (확장)     { …기존…, resolvedBy?: string, source?: string }
Supersession (신규) { old: string, new: string, ledger: string, adr: string[], note: string }  // INDEX 색인 파싱
DropRecord (신규)   { todo: string, initiative: string|null, resolvedBy: string, at: string }   // dropped todo
TimelineEvent (신규){ at: string, kind: string, ref: string, summary: string }  // 타입 정의만 — 채움=phase 2(W1)
```
- ProjectState 확장: `lineage.edges`(위 kinds 다), `drops: DropRecord[]`. (**타임라인 채움 = phase 2** — Gantt 소비자가 거기 있음.)
- **소유권**: 전부 파생(read-only). SoT = cling 문서. gootte write X.

### 파싱 소스 → 모델 (verbatim, ADR-0002)
| 소스 | 포맷 | → 모델 |
|---|---|---|
| INDEX `## Supersession 색인` | `<old> → **<new>** — [ledger](p) (ADR-N, 왜)` | `Supersession` → LineageEdge(supersede, note=verbatim, adr) |
| ledger `## supersede` | `- supersedes **X** — 왜(부분) (로그#, 날짜)` | LineageEdge(supersede\|supersede-partial by "부분/유지" 키워드, note verbatim) |
| ADR `Status: superseded by ADR-N` | body 라인 | LineageNode(adr) + LineageEdge(supersede, adr) |
| ledger "참조됨(소비, supersede 아님)" | 명시 라인 | LineageEdge(reference) — supersede 아님 |
| todo `resolvedBy` (dropped) | `resolvedBy: <init/ADR> (왜)` | `DropRecord` + LineageEdge(supersede, note) |
| todo `source: spec-decompose` | frontmatter | spawn(이미 initiative back-pointer) |
| ~~sprint·ledger 날짜~~ | — | `TimelineEvent` **채움 = phase 2**(W1) |

> **부분 판정 규칙(결정적 · 우선순위 reference > partial > supersede)** — B1:
> 1. **reference 키워드** {`참조됨`·`소비`·`선행 의존`} 포함 → `reference` (supersede 아님).
> 2. 아니고 **partial 키워드** {`부분`·`유지`·`살`·`생존`} 포함 → `supersede-partial`.
> 3. 둘 다 없으면 → `supersede`.
> verbatim `note` 는 항상 원문 보존(판정은 `kind` 만 결정). **애매하면 note 가 진실.**

> 🔴 **graceful 파싱(W2)** — 실 format 변이(ADR 0~N개·복잡 note·번호 중복)에 대비: malformed 라인은 skip(crash X, todo `safe()` 패턴), `adr` = `/ADR-\d+/g` 다중 추출, `note` = 나머지 verbatim.

## Reuse map
brief §reuse map + 기존 gootte: `parseLedger.supersedes`(살림)·`parseAdr`(배선)·`LineageNode/Edge`(채움). 새 파서 최소.

## Test Strategy
- `web/contract`: `tsc`.
- `web/core`(순수): **vitest** — parseIndex supersession · parseTodo resolvedBy/source · state lineage(부분 판정·drop·timeline) · renderLineage. fixtures = jinwooauto 실 INDEX/ledger/todo 복제.
- `web/cli`: acceptance — `gootte lineage jinwooauto` = supersede 체인·drop 목록 verbatim.
- verify: `pnpm verify`(tsc + vitest).

## Operations 영향
`gootte lineage <proj>` 신규 → 루트 `pnpm lineage` 스크립트 추가(`/cling:ops` 또는 직접). who=claude-ok.

## Task Breakdown
| T | 내용 | Files | acceptance | dep |
|---|---|---|---|---|
| **T1** | contract 확장 | `code/web/contract/src/index.ts` | LineageEdge(kind/note/adr)·TodoItem(resolvedBy/source)·Supersession·DropRecord·TimelineEvent export + tsc | — |
| **T2** | parsers | `code/web/core/src/parse/{index-doc,todo}.ts` | INDEX Supersession 파싱·todo resolvedBy/source vitest (jinwooauto fixture) | T1 |
| **T4** | load ADR 배선 | `code/web/core-io/src/load.ts` | `adr/*.md`+`_superseded/` 읽어 state 입력에 포함 | T1 |
| **T3** | state lineage 채움 (**신규 `state/lineage.ts`**, build.ts 가 호출 — W3) | `code/web/core/src/state/lineage.ts` (+build.ts) | supersede/partial/reference/spawn/dep/drop 엣지 + drops vitest(부분 판정·"참조됨" 구분·graceful) | T2,T4 |
| **T5** | render | `code/web/core/src/project/render.ts` | `renderLineage`(체인·drop verbatim) + plan rationale += supersede/drop vitest | T3 |
| **T6** | cli lineage | `code/web/cli/src/{commands,main}.ts` | `gootte lineage <proj>` 텍스트 + 루트 `pnpm lineage` | T5 |
| **T7** | jinwooauto acceptance | `__fixtures__` + acceptance | 실 supersede 체인·drop 이 verbatim·결정적으로 표면화 | T6 |

**DAG:** `T1→{T2, T4}` · `{T2,T4}→T3→T5→T6→T7`

## 외부 의존
없음(기존 zod·gray-matter·js-yaml 재사용).
