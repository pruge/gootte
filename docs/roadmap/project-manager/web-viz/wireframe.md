# wireframe — web-viz 2c

> ASCII (레이아웃 확정 = checklist #7). 스타일 = [ADR-0001](adr/0001-custom-rendering-references.md) 레퍼런스.

## 탭 + 뷰모드 (ADR-0002)
```
 jinwooauto        [ plan │ lineage │ worktree ]        [◐ theme]
 plan:  [ 리스트 · 보드 · 타임라인 ]        ← 뷰모드 토글(?view=)
```

## 보드 (Linear 룩)
```
┌ ACTIVE 2 ─────┐┌ READY 3 ──────┐┌ BLOCKED 1 ────┐
│ ▶ auth-harden ││ misc-gateway  ││ report-export │
│   active  high││   planned     ││   planned     │
│   └ 2 할일    ││   ← dep: auth ││   ⚠ dep 미충족 │
│               ││               ││               │
│ fsm-siteid    ││ notify-slack  ││               │
└───────────────┘└───────────────┘└───────────────┘
```
- 컬럼 = partition(active/ready/blocked) + count 배지. 카드 = PlanItem(NOW·status·priority chip·할일수·deps). blocked = 미충족 dep 강조.

## 타임라인 (CI 워터폴 룩, 날짜축)
```
        07-20   07-22   07-24   07-26
auth    ├━━━━━●━━━┫                     sprint 바(날짜) + ● kickoff 마커
gateway       ├━━━━━━━┫  ▲re-kickoff
report              ├━━┫
```
- 행 = 이니셔티브. 바 = **sprint** 기간(startedAt→endedAt). ● = kickoff, ▲ = re-kickoff 마커(희소 가능). x축 = **날짜** 눈금. (worktree 라이브 상태는 worktree 패널 — Gantt 바 아님, B1.)

## 그래프 (git-graph 세로 DAG)
```
● ghost-house
│╲
│ ● space          [ADR-0005]  대체
● 측창-reuse-actor
│╲
│ ⊘ 범용-positional (partial)  ┈ 부분대체(색)
● lan-direct
  ↑ operator-badge (drop)
```
- 노드 = 이니셔티브/ref(스파인). 엣지 = supersede(실선)·partial(색 파선)·spawn·drop. ADR 배지. 체인 세로 흐름(git log --graph).

## worktree 패널 (GitHub checks 룩)
```
┌ backend-api ─────────────────┐
│ ⬤ worktree-backend-api        │  conflictRisk 색(low=녹/med/high=적)
│ base a1b2 · main +3 commits   │
│ → auth-hardening · sprint …   │  [테스트할 것 →] (sprint 링크)
└───────────────────────────────┘
(활성 worktree 없으면 빈 상태)
```

## non-goal
- 드래그 상태변경 · 대규모 force 그래프 pan/zoom · bento 단일화면.
