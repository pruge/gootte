---
created: 2026-07-27
status: pending           # pending | in_progress | done
priority: normal
kind: single
todos: [019-blueprint-roadmap-reader]
worktree: null            # /cling:worktree 가 박음
related_sprints: []
---

# blueprint-roadmap-reader — ledger 없는 프로젝트도 이니셔티브 도출
> 단독. 1 worktree = 1 sprint. dogfooding 수정 — gootte self-view.

## scope
- 019-blueprint-roadmap-reader (normal) — `blueprint.md ## phases` 표에서 이니셔티브(+상태) 도출 → blueprint 스타일 cling 프로젝트(gootte 자신)도 roadmap 뷰에 표시.

## 🔴 Invariant 점검 (프로파일 Invariants 중 이 sprint 에 걸리는 것)
- **INV-1** (projection = md SoT 파생) — 이니셔티브는 blueprint.md(관리대상 md)에서 파생. 2차 SoT 없음.
- **INV-2** (관리대상 read-only) — blueprint.md 읽기만. write 없음.
- **INV-4** (read-path 결정적·LLM-free) — parseBlueprint 순수 함수, 이모지→상태 결정적 매핑.

## 작업 path (예상 phase)
### Phase 1 — CORE 파서
- `code/web/core/src/parse/blueprint.ts` (신규): `parseBlueprint(content)` → `{slug, status, order, deps?}[]`. `## phases` 표 행 파싱: `| **<num> · <slug>** <emoji> ... | ... |`. 이모지→상태 = ledger.ts `STATUS_EMOJI` 공유(추출 또는 재사용).
- vitest: gootte blueprint → phase 11개·상태 매핑·표 순서.

### Phase 2 — core-io 배선
- `code/web/core-io/src/load.ts`: roadmap 하위(1~2단계)에서 `blueprint.md` 발견 → parseBlueprint → LedgerInfo 형태로 이니셔티브 편입. **dedupe: 같은 slug면 ledger 우선.** 표 순서를 indexOrder 에 반영(INDEX.md 없을 때).
- track = null(표에 열 없음) → 미분류. 체크리스트 = 빈(gootte todo initiative:null).

## 다음 단계 결정 필요
- 없음(todo 019 가 설계 확정 — blueprint 표=SoT, 이모지 상태, slug=dir). deps 열 매핑(num→slug)은 buildRoadmap 이 deps 안 쓰므로 best-effort/생략 가능.

## 완료 기준
- 019 완료: `pnpm -C code/web verify` green — parseBlueprint 테스트 + load(gootte) initiatives>0 + ledger/blueprint 공존 dedupe.
- 전체 회귀: dev — **gootte** 선택 → roadmap 에 phase 들이 상태별(진행/완료/예정) 표시. jinwooauto(ledger) 무회귀.

## 관련 todo / spec
- [019-blueprint-roadmap-reader](../todo/019-blueprint-roadmap-reader.md) — 이 sprint 의 유일 todo
- [blueprint.md](../roadmap/project-manager/blueprint.md) — 파싱 대상(상태 SoT)
