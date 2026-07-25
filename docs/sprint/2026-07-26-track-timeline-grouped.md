---
created: 2026-07-26
status: in_progress
priority: normal
kind: single
todos: [020-track-timeline-grouped]
worktree: track-timeline-grouped
startedAt: 2026-07-26
related_sprints: [2026-07-26-track-projection]
---

# track-timeline-grouped — 타임라인 대분류 그룹 레이아웃 + hover (T5)
> 단독. 1 worktree = 1 sprint. 019(GanttRow.track + trackOrder) 위 프론트 렌더 — 사용자 원 요구(타임라인 대분류).

## scope
- 020-track-timeline-grouped (normal) — TimelineChart 를 좌측 대분류 세로 span + `│` + 그 track sprint 라인들로 재구성 + hover 시 행·그룹 라벨 co-highlight.

## 🔴 Invariant 점검
- **INV-2** — 렌더 전용(드래그·편집 X).
- **INV-4** — 그룹 순서 = 서버 `trackOrder`(결정적) 그대로 소비. 프론트는 배치만, 재판정 X.
- **INV-1** — `useTimeline` 캐시만.

## 작업 path (예상 phase)
### Phase 1 — 그룹 모델
- `TimelineResponse.trackOrder` + `rows[].track` 소비. rows 를 track.key(미분류=`__ungrouped__`)로 그룹핑, trackOrder 순 정렬. (순수 그룹핑 헬퍼 — 순서는 서버값 그대로.)

### Phase 2 — 좌측 세로 span 레이아웃
- 왼쪽 = 대분류 라벨(label + key) 셀이 그 track 행들을 세로 span(병합 셀) · `│` divider · 오른쪽 = 이니셔티브별 sprint 바(기존 렌더 재사용). 그룹 사이 가로 divider. 미분류 그룹 last. CSS grid/subgrid 또는 그룹별 flex 블록(커스텀, ADR-0003).

### Phase 3 — hover co-highlight
- sprint 바(또는 행) hover → 그 행 + 좌측 대분류 라벨 셀 동시 배경 변화(CSS bg, compositor-friendly, reduced-motion 무관). "이 sprint = 이 대분류" 시각 연결.

## 다음 단계 결정 필요
- 없음(spec·ADR-0003·wireframe 가 닫음).

## 완료 기준
- 020 완료: vitest — 그룹 헤더/행 렌더(mock TimelineResponse trackOrder+track, 다track+미분류), hover class 토글(그룹 라벨 셀 + 행 동시), 미분류 그룹 last · tsc. dev 실렌더(jinwooauto track별 그룹 — F/C/E/… 7축).
- 전체 회귀: `pnpm verify`(96+) green + `mermaid-refs-check`.

## 사용자 테스트
> 020 = 타임라인 대분류 그룹 렌더(사용자 원 요구). 자동 게이트(`pnpm verify` 100 tests)는 머지 전 실행 완료. 실렌더 스크린샷으로 좌측 대분류 세로 span 확인.

🌐 Frontend + Backend dev (user-runs)
```
pnpm dev
```

✅ 테스트
- plan 탭 → **[타임라인]** = 왼쪽 대분류 라벨(`label`+`key`)이 그 track 이니셔티브 행들을 **세로 span** + `│` + 오른쪽 sprint 바
- jinwooauto 선택 시 7 그룹(제어 알고리즘·실시간·owner…) — 각 그룹 아래 소속 sprint 라인들, 미분류 그룹은 맨 아래
- sprint 바/행에 **마우스 올리면 그 행 + 왼쪽 대분류 라벨 셀이 같이 배경색 변경**(co-highlight)
- 그룹 순서 = 서버 trackOrder 그대로(결정적)
- **대분류·이니셔티브 열 경계를 드래그**하면 폭 조절 → 긴 이니셔티브 이름 말줄임 해소(min 64px). 핸들은 컬럼 전체 높이에서 잡힘(hover 시 accent 세로선)
- 조절한 폭은 **localStorage에 프로젝트별 저장** → refresh 후 복원, 프로젝트 전환 시 각자 폭

## 관련 todo / spec
- [020-track-timeline-grouped](../todo/020-track-timeline-grouped.md) — 타임라인 그룹 + hover (T5)
- [spec](../roadmap/project-manager/track-grouping/spec.md) · [ADR-0003 세로span+hover](../roadmap/project-manager/track-grouping/adr/0003-timeline-grouped-layout.md) · [wireframe](../roadmap/project-manager/track-grouping/wireframe.md) · [M-0004](../mermaid/INDEX.md#M-0004)
