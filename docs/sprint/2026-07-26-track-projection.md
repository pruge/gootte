---
created: 2026-07-26
status: in_progress
priority: normal
kind: single
todos: [019-track-projection-api]
worktree: track-projection
startedAt: 2026-07-26
related_sprints: [2026-07-25-track-seam]
---

# track-projection — CORE projection + vocab + backend envelope (T3+T4)
> 단독. 1 worktree = 1 sprint. 018(Track seam) 위 — 정규화 track 부착 + trackOrder + profile vocab. 020/021 의 데이터 기반.

## scope
- 019-track-projection-api (normal) — `ProjectState.tracks` vocab · `computeTrackOrder` 단일 헬퍼 · buildPlan/buildKanban/buildGantt track 부착 + trackOrder · core-io 가 profile `## Tracks` 로드 · backend envelope.

## 🔴 Invariant 점검
- **INV-4** — trackOrder·정규화 부착 **결정적**(vocab 선언 순 + vocab밖 indexOrder 순 + 미분류 last). label = 어휘 verbatim.
- **INV-2** — core-io 가 `<project>/.cling/profile.md` `## Tracks` **읽기만**(write X).
- **INV-1** — track/trackOrder 는 md SoT(ledger + profile 어휘)에서 재생성 파생물. 손유지 2차 SoT 없음.

## 작업 path (예상 phase)
### Phase 1 — vocab 로드 (core-io)
- `core-io/load.ts` 가 `<project>/.cling/profile.md` 읽어 `parseProfileTracks` → vocab. `ProjectState.tracks: Map<string,string>` 에 저장(build.ts). 없으면 빈 맵(프로즈 fallback).

### Phase 2 — 순서 단일 소유 (project/track.ts)
- `computeTrackOrder(state): string[]` — vocab 선언 순 + vocab밖 key(indexOrder 최초등장) + 미분류 `"__ungrouped__"` last. buildGantt·buildPlan **공유**(DRY).

### Phase 3 — projection 부착
- `buildGantt` = GanttRow.track = `normalizeTrack(init.track, vocab)` (stub null 대체) + trackOrder. `buildPlan` 산출 = trackOrder(PlanResponse). `buildKanban` = PlanItem 은 018대로 track string 유지(021이 승격) — 단 trackOrder 는 필요 시 계산 재사용.
- `GanttResult`·plan 반환에 `trackOrder` 추가 → backend envelope(`TimelineResponse`/`PlanResponse`).

### Phase 4 — backend
- `app.ts` /api/timeline·/api/plan 이 trackOrder + rows.track 흐름(projection 파생 — 로직 X).

## 다음 단계 결정 필요
- 없음(spec 이 닫음). PlanItem.track→Track 승격은 021(소비처 board/list/CLI 와 함께) — 019는 GanttRow.track + trackOrder 까지.

## 완료 기준
- 019 완료: vitest — `computeTrackOrder`(순서 결정적: vocab 순·vocab밖·미분류 last) · buildGantt track 부착(vocab 있음=canonical label / 없음=프로즈) · core-io profile vocab 로드(없으면 빈 맵) · app.test /api/timeline·/api/plan 에 trackOrder + rows.track. tsc.
- 전체 회귀: `pnpm verify`(90+) green + `mermaid-refs-check`.
- 실데이터: jinwooauto vocab 없이도(현재) 7축 trackOrder 산출 — dev /api/timeline 에서 rows.track key 확인.

## 사용자 테스트
> `/cling:worktree` 개발 완료 보고 시 채움.

## 관련 todo / spec
- [019-track-projection-api](../todo/019-track-projection-api.md) — projection + vocab + envelope (T3+T4)
- [spec](../roadmap/project-manager/track-grouping/spec.md) · [ADR-0002 label해소](../roadmap/project-manager/track-grouping/adr/0002-profile-tracks-label-resolution.md) · [M-0004](../mermaid/INDEX.md#M-0004)
