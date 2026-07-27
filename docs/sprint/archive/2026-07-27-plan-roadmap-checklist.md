---
created: 2026-07-27
status: done              # pending | in_progress | done
priority: normal
kind: single
todos: [018-plan-roadmap-checklist]
worktree: plan-roadmap-checklist
startedAt: 2026-07-27
endedAt: 2026-07-27
related_sprints: []
---

# plan-roadmap-checklist — plan 리스트 v2 (roadmap 목록 + 할일 체크리스트 드릴다운)
> 단독. 1 worktree = 1 sprint. 리셋 후 첫 초점(하나만) — plan **리스트**만, lineage 보류.

## scope
- 018-plan-roadmap-checklist (normal) — plan 리스트에서 각 roadmap 이니셔티브(완료+예정+진행)를 track별로 보여주고, 클릭하면 그 이니셔티브의 할일 체크리스트(한일 ☑ / 남은일 ☐)를 펼쳐 "뭐가 끝났고 뭐가 남았나"를 한눈에.

## 🔴 Invariant 점검 (프로파일 Invariants 중 이 sprint 에 걸리는 것)
- **INV-1** (projections derived from md SoT) — `buildRoadmap`은 `ProjectState`(=md 파싱 결과)에서만 파생. 체크리스트 done/pending은 각 todo frontmatter `status`가 SoT(ledger md 파싱 X). 상태를 이중 저장하지 않음.
- **INV-3** (views always reflect current SoT) — roadmap 목록·체크리스트는 매 요청 state 재계산(캐시된 별도 상태 X).
- **INV-4** (read-path deterministic · LLM-free) — 전 경로 순수 함수. 정렬(진행·예정 먼저 → 완료 뒤, trackOrder)은 결정적.
- **INV-2** (gootte read-only on managed docs) — 이 sprint 는 read/projection/렌더만. 관리 대상 프로젝트 문서 write 없음.

## 작업 path (예상 phase)
### Phase 1 — CORE projection
- `code/web/core/src/project/roadmap.ts` (신규): `buildRoadmap(state)` → 전 이니셔티브(완료 포함) → `RoadmapItem{initiative, track(정규화), status, done:[todoSlug], pending:[todoSlug]}`, `computeTrackOrder`/`presentTrackOrder` 재사용해 trackOrder 순 그룹. done = `initiative.todos`(archive된 done 포함) 중 status done, pending = 나머지 actionable. 정렬 = 진행·예정 먼저 → 완료 뒤.
- vitest: 완료 포함·done/pending 분리·trackOrder 순·상태 배지 매핑.

### Phase 2 — CONTRACT
- `code/web/contract/src/index.ts`: `RoadmapItem{initiative, track: Track.nullable(), status, done: string[], pending: string[]}` + `RoadmapResponse{project, items, trackOrder}`. (seam 최소 — 별 응답 vs PlanResponse 확장은 구현 시 결정, 기본 별 응답.)

### Phase 3 — backend
- `/api/roadmap/:slug` (Hono) — `buildRoadmap` → `RoadmapResponse`. app.test 추가.

### Phase 4 — frontend
- 리스트 뷰 = track 그룹 헤더 + 항목(상태 배지 ✅/🔜/⬜) + **클릭 시 펼쳐 체크리스트**(useState 확장 토글, 한일☑/남은☐ + 카운트). `usePlan` 자리 재사용(`useRoadmap`).
- Tabler 아이콘·semantic 토큰. 021 track 그룹 스타일 재사용.

## 다음 단계 결정 필요
- 없음(todo 018 이 Q1=ⓐ·Q2=ⓐ 로 닫음). 응답 형상(별 응답 vs PlanResponse 확장)만 Phase 2 착수 시 확정 — 기본 별 응답.

## 완료 기준
- 018 완료: `pnpm -C code/web verify`(tsc --noEmit + vitest run) green — buildRoadmap 테스트(완료 포함·done/pending 분리·trackOrder) + 체크리스트 렌더 + 클릭 펼침 토글 + app.test `/api/roadmap` 통과.
- 전체 회귀: dev(jinwooauto) — plan 리스트에 완료 이니셔티브 표시 → 클릭 → 그 이니셔티브 할일 done☑/남은☐ 펼쳐짐. 기존 timeline/board 무회귀.

## 사용자 테스트
> 자동 게이트(제가 머지 전 실행): `pnpm verify` — tsc 전 패키지 + vitest **113 passed**(buildRoadmap 5 · app /api/roadmap · RoadmapView 6 포함). 아래는 사용자 몫 가시 확인.

🌐 dev 서버 (backend+frontend)
```
pnpm dev
```

✅ 테스트 (sprint 전체 — jinwooauto 실데이터로 확인함)
- `:5173` → 왼쪽 **jinwooauto** 선택 → **plan** 탭 → **리스트** 모드: 본문 좌측에 **대분류(track) 사이드바**(C 제어 알고리즘 · E · F …, 각 track 에 `진행 n · 완료 m` 카운트).
- 대분류 클릭 → 우측 패널이 그 track 으로 전환. 우측 상단 **진행 / 완료 탭**으로 이니셔티브 구분(탭 본문은 넘치면 화면 높이 내에서 자체 스크롤).
- 이니셔티브 클릭 → 할일 체크리스트 펼침: **한일 ☑(취소선) / 남은일 ☐** + 진척 배경 fill. 다시 클릭 → 접힘.
- **할일 클릭 → 우측 문서 뷰어** 슬라이드오버(archive면 배지). ESC·백드롭·X 로 닫힘.
- 뷰어 우측 상단 **보기 / raw 토글**: `보기` = 마크다운 렌더(제목·표·task-list) + **mermaid 다이어그램**, `raw` = 원문(프론트마터 포함). mermaid/markdown 라이브러리는 뷰 진입 시에만 lazy 로드(메인 번들 무영향).
- 완료 탭에 shipped 이니셔티브(예: `mapping-platform-restore` 4/4) → 클릭하면 done 만 ☑.
- 보드/타임라인 모드 무회귀(기존 그대로).

## 관련 todo / spec
- [018-plan-roadmap-checklist](../todo/018-plan-roadmap-checklist.md) — 이 sprint 의 유일 todo (설계 확정본)
