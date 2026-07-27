---
created: 2026-07-27
status: in_progress         # pending | in_progress | done
priority: normal
kind: single
todos: [026-ledger-track-bold-parse]
worktree: ledger-track-bold-parse
startedAt: 2026-07-27
endedAt: null
related_sprints: []
---

# ledger-track-bold-parse — 볼드 `**트랙**:` 인식으로 미분류 오탐 수리
> 단독. 1 worktree = 1 sprint. web-viz(track-grouping) shipped 의 read-path 버그 수리.

## scope
- 026-ledger-track-bold-parse (normal) — `ledger.ts` 트랙 프로즈 정규식을 볼드/전각콜론 허용으로 완화 + 회귀 테스트. jinwooauto 미분류 9→3.

## 🔴 Invariant 점검 (프로파일 Invariants 중 이 sprint 에 걸리는 것)
- **INV-4** (read-path 결정적·LLM-free) — 정규식은 순수·결정적. 추론/요약 없이 원문 반환, 정규화는 normalizeTrack(projection)이 담당.
- **INV-1** (projection = md SoT 파생) — 원장 프로즈가 SoT, 파서는 그 SoT 를 정확히 읽기만. 값 보정/추측 X.

## 작업 path (예상 phase)
### Phase 1 — 파서 수정
- `core/src/parse/ledger.ts:38` 정규식 `/트랙:\s*/` → `/트랙[*_]*\s*[:：]\s*/`.

### Phase 2 — 회귀 테스트
- `core/src/parse/ledger.test.ts`(신규) 또는 기존 `parse.test.ts` 에 볼드/비볼드 케이스.

## 다음 단계 결정 필요
- 없음(spec-less 단순 수리 — todo 가 닫음).

## 완료 기준
- 026 완료: 볼드 `- **트랙**: F` 케이스 파싱 통과 + 비볼드 무회귀, `pnpm verify` green.
- 전체 회귀: backend(jinwooauto) `/api/roadmap/jinwooauto` `__ungrouped__` = 9→3.
