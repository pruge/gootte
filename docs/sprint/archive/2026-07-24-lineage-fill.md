---
created: 2026-07-24
status: done
priority: high
kind: bundle
todos: [005-contract-parse-adr, 006-state-render]
worktree: lineage-fill
startedAt: 2026-07-24
endedAt: 2026-07-24
related_sprints: []
---

# lineage-fill — 결정적 lineage 엔진 (contract+parse+adr+state+render)
> 묶음. lineage-supersede 핵심 엔진(T1·T2·T4·T3·T5). 007(cli+jinwooauto)이 finish.

## scope
- `005-contract-parse-adr` (high) — T1 contract 확장(LineageEdge/TodoItem/Supersession/DropRecord) · T2 parse(INDEX supersession·todo resolvedBy/source) · T4 core-io load ADR 배선
- `006-state-render` (high) — T3 state/lineage.ts(supersede/partial/reference/drop 채움) · T5 render(renderLineage + plan rationale)

## 🔴 Invariant 점검
- **INV-4** — read-path 결정적·LLM-free. 부분 판정=키워드(결정적), 산문 "왜"=verbatim 릴레이(요약 X).
- **INV-2** — 읽기 전용(파싱만). **INV-1** — projection 재생성.

## 묶음 근거
- 전부 core/contract 한 도메인(입력→state→render). 확장-task라 응집 높음.

## 작업 path (예상 phase)
### Phase 1 — T1 contract 확장 (`code/web/contract`)
- LineageEdge(+kind/note/adr) · TodoItem(+resolvedBy/source) · Supersession · DropRecord · (TimelineEvent 타입만).
### Phase 2 — T2 parse (`code/web/core/parse`)
- parseIndex += Supersession 섹션 · parseTodo += resolvedBy/source. graceful(malformed skip).
### Phase 3 — T4 load ADR 배선 (`code/web/core-io/load`)
- `adr/*.md`+`_superseded/` 읽어 parseAdr → state 입력.
### Phase 4 — T3 state/lineage.ts (`code/web/core/state`, 순수)
- 5소스 → LineageEdge. **부분 판정 우선순위**(reference>partial>supersede) · drops · note verbatim.
### Phase 5 — T5 render (`code/web/core/project`)
- renderLineage(체인·drop verbatim) + renderPlan rationale += supersede/drop.

## 다음 단계 결정 필요
- 없음 (spec 이 닫음 — B1/W1/W2/W3 반영).

## 완료 기준
- `005`: 타입 export + tsc · INDEX Supersession·todo resolvedBy/source·ADR 파싱 vitest(jinwooauto fixture).
- `006`: 부분 판정·"참조됨"구분·drop·graceful vitest · renderLineage 텍스트 + plan rationale supersede 표면화.
- 전체 회귀: `pnpm verify` green.

## 사용자 테스트
> sprint `lineage-fill` 완료 기준 (`/cling:notify --all`).

**순수 라이브러리 (lineage 엔진) — 사용자 가시 CLI = 007(`gootte lineage`).** 이 sprint는 엔진.

자동 게이트 (제가 머지 전 실행 — 이미 green):
- `pnpm verify` → tsc 4/4 · **vitest 25/25** (신규 lineage 5: supersedeKind B1 우선순위 · buildLineage supersede/ADR/drop · parseIndex Supersession · renderLineage verbatim)
- 실데이터 확인: jinwooauto INDEX → **supersession 15 파싱**(graceful, 6 변이 skip) · resolvedBy/ADR 추출 동작

(007에서 `gootte lineage jinwooauto`로 15 체인 + drop 43 실제 텍스트 출력.)

## 관련 todo / spec
- [005](../todo/005-contract-parse-adr.md) · [006](../todo/006-state-render.md)
- [spec](../roadmap/project-manager/lineage-supersede/spec.md)
