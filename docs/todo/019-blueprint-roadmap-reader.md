---
status: in_progress
priority: normal
sprint: blueprint-roadmap-reader
initiative: null
area: [web/core, web/core-io]
source: user-request
related: [../roadmap/project-manager/blueprint.md]
created: 2026-07-27
---

# blueprint roadmap reader — ledger 없는 프로젝트도 이니셔티브 도출

> dogfooding 발견: gootte 자신을 gootte로 보면 "이니셔티브 없음". 리더가 `ledger.md`만 마커로 쓰는데 gootte는 blueprint 형식(ledger 0).

## 목적
`docs/roadmap`에 `ledger.md`가 없어도 **`blueprint.md`의 `## phases` 표**에서 이니셔티브(+상태)를 도출해, blueprint 스타일 cling 프로젝트(gootte 자신 포함)도 roadmap/plan 뷰에 표시.

## 근거 (신호 확인됨)
`docs/roadmap/project-manager/blueprint.md`의 `## phases` 표가 ledger와 **동일 이모지 상태 규약** 사용:
```
| **1 · lineage-engine** ✅ done | ... | dep |
| **2b · web-realtime** 🔜 Now | ... | 2a |
| **3 · remote-mobile** ⬜ Later | ... | 2 |
```
- ✅→shipped · 🔜→active · ⬜→planned (parseLedger `STATUS_EMOJI` 그대로 재사용).
- phase `· <slug>` = 하위 디렉토리명(`project-manager/web-viz/` 등)과 일치.
- 표 행 순서 = 로드맵 순서(gootte엔 INDEX.md 없음 → 이게 indexOrder 대체).

## 작업 (예상)
- **CORE** `parseBlueprint(content)` (신규 `parse/blueprint.ts`) — `## phases` 표 행 파싱 → `{slug, status, order, deps?}`. `STATUS_EMOJI`를 ledger.ts에서 공유(추출) 또는 재사용. 순수·결정적(INV-4).
- **core-io** `load.ts` — roadmap 스캔 시 각 하위(1~2단계)에서 `blueprint.md` 발견하면 parseBlueprint → 이니셔티브로 편입. **dedupe: 같은 slug면 ledger 우선**(ledger가 더 상세). 표 순서를 indexOrder에 반영(INDEX.md 없을 때).
- **중첩 스캔** — 현재 `docs/roadmap/<name>/`만 1단계 스캔. blueprint는 `<epic>/blueprint.md`, 이니셔티브 디렉토리는 그 하위. blueprint 발견 시 그 표가 이니셔티브 목록의 SoT(디렉토리 존재는 부차).
- track = null(표에 track 열 없음) → 미분류 그룹. 체크리스트 = 빈(현재 gootte todo는 initiative:null). **후속**: todo `related` 경로로 이니셔티브 연결(별도 todo).

## acceptance
vitest — parseBlueprint(gootte blueprint → phase 11개·상태 매핑·순서) · load(gootte) → initiatives>0 · ledger+blueprint 공존 dedupe(ledger 우선). dev 실렌더: gootte 선택 → roadmap에 phase들이 상태별(진행/완료/예정)로 표시.

## 의존
없음(buildRoadmap·뷰는 이미 initiatives 소비 — 리더가 채우기만 하면 됨).
