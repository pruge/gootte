---
created: 2026-07-29
status: done
completedAt: 2026-07-29
priority: high
sprint: null
initiative: null          # gootte = blueprint 스타일(ledger 미선언) → related 로 연결
area: [web/core, web/backend]
tags: [worktree, binding, dashboard, single-source, regression]
related:
  - ../roadmap/project-manager/web-dashboard/spec.md
  - ./archive/024-worktree-binding-slug-date-mismatch.md
  - ./archive/030-worktree-body-panel-binding.md
source: user-report
---

# 033 — 활성 worktree 카운트 단일 소스 통일

> 사용자 보고 (2026-07-29) — jinwooauto 좌측 사이드바 배지는 worktree 2개, 본문(roadmap "작업중")은 1개만. 두 뷰가 **서로 다른 소스**를 쓰고, 본문 소스는 "이니셔티브 1 : worktree 1"만 표현해 같은 이니셔티브의 두 worktree 중 하나를 덮어씀.

## 근본 원인 (재현 완료)
- **사이드바 배지** (`/api/projects`, `backend/src/app.ts:113`) = `scanWorktrees(path).length` — raw git 스캔. 바인딩 무관 → **2**.
- **본문 "작업중"** (`/api/worktree/:slug`, `app.ts:71` `worktreeStatuses`) = `state.initiatives` 순회하며 `i.worktree`(**단수**) emit → **1**.
- gootte 실데이터: `2026-07-29-send-gateway-engine`·`2026-07-29-send-authoring-materialize` 두 worktree가 **같은 이니셔티브 `send-command-unification`** 에 묶임(T2/T3 병렬 분할).
- `core/src/state/build.ts:52-65` 의 `wtByInitiative: Map<initiative, WorktreeInput>` 가 **이니셔티브를 키**로 잡아 last-write-wins → 하나 소실. `model.ts:47` `InitiativeState.worktree: WorktreeInput | null` 도 **단수**라 1:N 표현 불가.

## 의도 (단일 소스 통일)
- 활성 worktree 목록을 만드는 **lib 함수 1개**를 분리하고, 사이드바 배지(=`length`)와 본문(=목록) **둘 다 그걸 가져다 쓴다**.
- 바인딩을 **worktree 키 기준**(이니셔티브 키 X)으로 바꿔 `1 이니셔티브 : N worktree` 를 온전히 표현 → 스캔된 worktree 가 하나도 소실되지 않음.
- 결과: 사이드바 카운트 == 본문 카운트 (항상 동일 소스 파생, INV-3).

## 다음 단계 결정 필요 (sprint 화 시)
- **lib 위치**: 순수 바인딩(worktree→initiative|null 목록)은 `web/core` (state projection). gitSignal 부착은 core-io 산출을 backend 가 조립 — `worktreeStatuses` 를 core projection + backend 얇은 래퍼로 재배치할지, backend lib 한 곳으로 뺄지 결정.
- **모델 변경 범위**: `InitiativeState.worktree`(단수) → `worktrees: WorktreeInput[]`(복수)로 갈지, 아니면 `state` 에 별도 `worktreeBindings: {slug, initiative|null}[]` projection 을 추가할지. lineage/plan 등 `i.worktree` 단수 소비처 영향 점검.
- **미바인딩 worktree**: sprint/initiative 매칭 실패한 worktree도 카운트/목록에 포함(`initiative: null`)해 사이드바=본문 일치 유지. 프론트 `worktreesByTrack` 는 이미 UNGROUPED 처리 존재 — 회귀 확인.
- **회귀 테스트**: 같은 이니셔티브 2 worktree fixture 로 `scanWorktrees().length == activeWorktrees().length` 단위 테스트 추가.

## 관련
- spec: `../roadmap/project-manager/web-dashboard/spec.md`
- 선행 worktree 바인딩 계열: 024(slug 날짜 불일치)·030(본문 패널 바인딩)
