---
created: 2026-07-25
status: in_progress
priority: normal
kind: single
todos: [018-track-contract-parse]
worktree: track-seam
startedAt: 2026-07-25
related_sprints: [2026-07-25-timeline-view]
---

# track-seam — Track 계약 + 정규화 (T1+T2)
> 단독. 1 worktree = 1 sprint. track-grouping DAG 선행 seam — 하류(019~021) 전부의 기반.

## scope
- 018-track-contract-parse (normal) — CONTRACT `Track{key,label}` seam + CORE 순수 정규화(`normalizeTrack`·`parseProfileTracks`) + `parseLedger` frontmatter 우선.

## 🔴 Invariant 점검
- **INV-4** — 정규화·key추출·label해소는 **결정적·LLM-free**. label = 어휘/프로즈에서 **verbatim 릴레이**(요약·추론 X). 18변형→7축 수렴은 순수 규칙(볼드·이모지·`Track ` 접두·`C —` 변형 제거 + 선두 대문자 key).
- **INV-2** — profile `## Tracks`·ledger 읽기 전용(이 sprint은 파싱만, write X).
- **INV-1** — track 은 md SoT(ledger track + profile 어휘)에서 재생성되는 파생물.

## 작업 path (예상 phase)
### Phase 1 — CONTRACT seam (T1)
- `Track{key,label}` 신설 · `PlanItem.track`(string→`Track.nullable`) · `GanttRow.track` · `TimelineResponse`/`PlanResponse` 에 `trackOrder: string[]`. codegen 재실행 → `contract:check` diff 0.

### Phase 2 — CORE 정규화 (T2, 순수)
- 신규 `parse/track.ts` — `normalizeTrack(raw, vocab)`(클린·key추출·label해소·복수표기 선두채택·미분류 null) + `parseProfileTracks(content)`(`## Tracks` 표 → key↔label).
- `parse/ledger.ts` — track = **frontmatter `track:` 우선 + 프로즈 `트랙:` fallback**(하이브리드, 레거시 무회귀).

## 다음 단계 결정 필요
- 없음(spec 이 닫음). 하류 019(projection)·020/021(프론트)은 이 seam 위.

## 완료 기준
- 018 완료: `contract:check`(codegen diff 0) · vitest — `normalizeTrack` 18변형 수렴(볼드·이모지·`Track `·`C —`/`C -`·후행 🔴)·label 해소(vocab 있음=canonical / 없음=프로즈 파생)·미분류(null/공백)·복수표기 선두채택 · `parseProfileTracks` 표 파싱 · `parseLedger` frontmatter 우선·프로즈 fallback·둘 다 없으면 null(기존 fixture 무회귀). tsc.
- 전체 회귀: `pnpm verify`(78+) green + `mermaid-refs-check`.

## 사용자 테스트
> 018 = 내부 seam(CONTRACT Track 타입 + 정규화 순수함수 + parseLedger frontmatter). **사용자 가시 UI 변화 없음** — PlanItem.track 미변경, GanttRow.track/trackOrder = stub(019가 populate). 자동 게이트(`pnpm verify` 90 tests)는 머지 전 실행 완료.

**사용자 가시 테스트 없음** (내부 계약·정규화). 검증은 자동:
- `pnpm verify` → tsc + 90 tests green (신규 12: normalizeTrack 18변형 수렴·어휘/프로즈 label·미분류·parseProfileTracks·parseLedger frontmatter 우선).
- 실데이터 sanity: jinwooauto 93 track ledger → 정규화 후 **7 distinct key(A~G)** 수렴 확인(그룹핑 기반).

## 관련 todo / spec
- [018-track-contract-parse](../todo/018-track-contract-parse.md) — Track seam + 정규화 (T1+T2)
- [spec](../roadmap/project-manager/track-grouping/spec.md) · [ADR-0001 seam](../roadmap/project-manager/track-grouping/adr/0001-track-external-writer-seam.md) · [ADR-0002 label해소](../roadmap/project-manager/track-grouping/adr/0002-profile-tracks-label-resolution.md) · [M-0004](../mermaid/INDEX.md#M-0004)
