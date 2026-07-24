# wireframe — web-dashboard 2a

> ASCII 레이아웃 (레이아웃 확정 = checklist #7 닫음). 스타일 = [ADR-0004](adr/0004-theme-design-direction.md).

## 셸 (사이드바 + 메인)
```
┌─ gootte ─────────────────────────────────[◐ theme]─┐
│┌──────────┐┌────────────────────────────────────── │
││ PROJECTS ││ jinwooauto            [ plan │ lineage]│
││──────────││──────────────────────────────────────  │
││▸jinwoo…  ││  ▶ NOW  ① misc-gateway    planned      │
││ tuya     ││          ├ field-device-hardening      │
││ basket…  ││          └ fsm-state-siteid-…          │
││ exchange ││         ② auth-hardening   active      │
││ study    ││          ├ auth-device-bound-token     │
││ …        ││          └ …                           │
││          ││                                        │
││ (자동발견)││  ── 왜 이 순서 ──                       │
││          ││  ① 의존 충족·다음 전선                   │
│└──────────┘└────────────────────────────────────── │
└─────────────────────────────────────────────────────┘
```
- **좌 사이드바** = `/api/projects`(자동발견). 선택 = URL `?p=jinwooauto`. Tabler 아이콘(상태).
- **우 메인** = 탭 `?tab=plan|lineage`. NOW=accent 강조.

## plan 탭
- PlanItem 리스트: `▶NOW` 마커 · `①②③` 순서 · initiative · status · 할일(subSteps 들여쓰기) · 의존.
- 하단 "왜 이 순서": rationale(우선순위·방치비용〔git〕·정지점).

## lineage 탭
```
── supersede 체인 (15) ──
ghost-house → space          [ADR-0005]
    feature 은퇴
측창 reuse actor → 범용 Positional…
    control-algorithm-layer phase 2
── drop (40) ──
ldoc-operator-badge → lan-direct-…/ADR-0004
    P3 …흡수
```
- supersede: `old → new` + ADR 배지(Tabler tag) + note verbatim(들여쓰기). partial=다른 색.
- drop: `todo → resolvedBy` verbatim.

## theme
- 우상단 토글(◐) = system/dark/light 순환. dark=미션컨트롤 / light=에디토리얼. `data-theme` + `dark:`.
- ref/ADR/SHA = monospace. 본문 = Pretendard.

## non-goal (2a)
- 칸반 칼럼·Gantt 시간축·supersede 노드그래프 = **2c**(리스트/체인 텍스트-강화까지만).
