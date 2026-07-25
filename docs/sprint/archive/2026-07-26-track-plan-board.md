---
created: 2026-07-26
status: done
priority: normal
kind: single
todos: [021-track-plan-board]
worktree: track-plan-board
startedAt: 2026-07-26
endedAt: 2026-07-26
related_sprints: [2026-07-26-track-projection, 2026-07-26-track-timeline-grouped]
---

# track-plan-board — 리스트 track 헤더 + 보드 칩 + PlanItem.track 승격 (T6)
> 단독. 1 worktree = 1 sprint. track-grouping 마지막 — 019(PlanResponse.trackOrder) 위 리스트·보드 렌더 + PlanItem.track string→Track 승격.

## scope
- 021-track-plan-board (normal) — PlanItem.track(string→`Track`) 승격 + 소비처(BoardCard·PlanItemRow·CLI render) 갱신 · 리스트(plan) track 섹션 헤더(trackOrder 순) · 보드 카드 정규화 track 칩.

## 🔴 Invariant 점검
- **INV-4** — 리스트 그룹 순서 = 서버 `trackOrder` 그대로(결정적). PlanItem.track 정규화는 CORE(019 방식 재사용), 프론트는 배치만.
- **INV-2** — 렌더 전용(드래그·편집 X).
- **INV-1** — `usePlan` 캐시만.

## 작업 path (예상 phase)
### Phase 1 — CONTRACT + CORE: PlanItem.track 승격
- `PlanItem.track`: `z.string().optional()` → `Track.nullable().default(null)`. `partition.planItemOf` 가 `normalizeTrack(init.track, vocab)` 부착(buildKanban/buildPlan 이 vocab 전달 — buildGantt 선례).
- 소비처 typecheck 갱신: CLI `render.ts`(`p.track` string→`{key,label}`).

### Phase 2 — 리스트(plan) 섹션 헤더
- `PlanView` — `PlanResponse.trackOrder` 소비, 항목을 track.key(미분류 last)로 그룹핑 후 헤더(`key · label`) 아래 렌더(전역 order 유지). 그룹핑 헬퍼 재사용/추출(timeline groupByTrack 과 동형 — 순수).

### Phase 3 — 보드 track 칩
- `BoardCard` — 기존 원문 track 렌더를 **정규화 `{key} label` 칩**으로 대체(상태 3컬럼 그대로, non-goal=스윔레인).

## 다음 단계 결정 필요
- 없음(spec·wireframe 가 닫음). track-grouping 종결 phase.

## 완료 기준
- 021 완료: `contract:check`(N/A — codegen 미배선, tsc) · vitest — buildPlan/buildKanban PlanItem.track = 정규화 Track · 리스트 track 헤더 그룹핑(mock trackOrder, 미분류 last) · 보드 카드 정규화 track 칩(원문 아님) · CLI render track 갱신. tsc.
- 전체 회귀: `pnpm verify`(102+) green + `mermaid-refs-check`.
- 실렌더: jinwooauto 리스트 = track 섹션 헤더로 묶임 · 보드 카드 = `C 제어 알고리즘` 류 칩.

## 사용자 테스트
> 021 = track-grouping 마지막 — 리스트 track 헤더 + 보드 칩 + PlanItem.track 승격. 자동 게이트(`pnpm verify` 104 tests)는 머지 전 실행 완료. 실렌더 스크린샷으로 두 뷰 확인.

🌐 Frontend + Backend dev (user-runs)
```
pnpm dev
```

✅ 테스트
- plan 탭 → **[리스트]** = 대분류(track) 섹션 헤더(`C 제어 알고리즘`·`F 실시간`…)로 이니셔티브 묶임, 헤더 안은 서버 order 유지, 미분류 맨 아래
- plan 탭 → **[보드]** = 카드에 정규화 track 칩(`G 프로비저닝 / 인증 / 기타` 류 `{key} {label}`) — 기존 원문 칩 대체
- **[타임라인]** = 020의 대분류 세로 span (세 뷰 전부 track 반영 = track-grouping 종결)
- CLI `pnpm plan jinwooauto` 도 `(key label)` 표기

## 관련 todo / spec
- [021-track-plan-board](../todo/021-track-plan-board.md) — 리스트 헤더 + 보드 칩 (T6)
- [spec](../roadmap/project-manager/track-grouping/spec.md) · [wireframe](../roadmap/project-manager/track-grouping/wireframe.md) · [M-0004](../mermaid/INDEX.md#M-0004)
