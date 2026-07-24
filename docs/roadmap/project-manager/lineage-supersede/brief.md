# brief — lineage-supersede (project-manager · phase 1 보강)

> blueprint 종속. 전체·seam·불변식 = [../blueprint.md](../blueprint.md). phase 1(lineage-engine) 이 정렬만 하고 **lineage 를 안 채운** gap 을 메운다.

## 문제
gootte 는 cling 문서의 **supersede/drop/spawn/타임라인 데이터를 대부분 안 쓰거나 파싱하고 버린다**(실측: INDEX Supersession 21·ledger supersede 127·ADR 15·todo resolvedBy 43·todo source 52·sprint 날짜 463 미사용). 결과 = plan 의 "왜"가 얕고, 당신이 원한 **"어느 시점에 왜 다시 kickoff·drop된 것·새로 개발할 것"** 이 안 나옴.

## 이 phase
**lineage 그래프를 실제로 채우고 표면화.** supersede 4소스 + drop(resolvedBy) + spawn(source) + 타임라인(날짜)을 파싱 → `LineageNode/Edge` 채움 → `gootte plan` rationale 에 "supersedes X (ADR)·drop Y" 실음 + **`gootte lineage <proj>`** 텍스트 뷰(체인·drop·타임라인).

## blueprint 에서 소비 (재정의 X)
- Contract `LineageNode/Edge`·`KickoffEvent`(**확장** — 재등록 아님) · INV-1/2/3 · M-0001.

## net-new 결정
- **부분 supersede 모델** — `LineageEdge` 확장(`supersede-partial`·`reference` kind + verbatim `note` + `adr[]`). "X 유지·Y 폐기"·"참조됨≠supersede".
- **read-path 결정적·LLM-free** — 산문 supersede/resolvedBy 를 **verbatim 릴레이**(요약 X). 지능은 write-time 캡처.
- **기존 파싱-버림 배선** — `ledger.supersedes`(state로), `TodoItem.resolvedBy/source`(추가), `parseIndex` Supersession, `parseAdr` load 배선.

## scope — (나)
lineage 채움(supersede/partial/reference/spawn/drop) + `gootte plan` 표면화 + `gootte lineage` 텍스트.

## non-goal
**타임라인 채움**(=phase 2, W1) · 시각 supersede 그래프·Gantt(**phase 2 웹**) · LLM 합성/요약 · write-time 캡처 개선(external-writer seam = 별 후속).

## reuse map
[문서 지도](../../../_memo/) — INDEX Supersession 색인(`<old>→<new>—[ledger](p)(ADR,왜)`) · ledger `## supersede`(부분여부·"참조됨") · ADR `Status: superseded by`(+`adr/_superseded/`) · todo `resolvedBy`/`source` · sprint/ledger 날짜.

## ADR 색인
- **ADR-0001** 부분 supersede 모델 — LineageEdge 확장(partial·reference·note·adr)
- **ADR-0002** read-path 결정적·LLM-free — verbatim 릴레이, 지능은 write-time
- **ADR-0003** 기존 파싱-버림 데이터 배선 (ledger.supersedes·TodoItem.resolvedBy/source·INDEX supersession·ADR)
