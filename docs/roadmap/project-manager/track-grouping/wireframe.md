# wireframe — track-grouping (2d)

> ASCII. 실제 스타일 = Tailwind 토큰(bg-surface·border·accent…), Tabler 아이콘, Pretendard.

## 타임라인 — 좌측 대분류 세로 span + `│` + track 라인들 (ADR-0003)
```
              │  이니셔티브              07-05    07-14    07-24
──────────────┼───────────────────────────────────────────────
              │  control-execution      ▬▬▬▬  ●         ▲
 제어 알고리즘 │  fsm-authoring-builder        ▬▬▬
   (C)        │  fsm-loop-authoring                 ▬▬▬
──────────────┼───────────────────────────────────────────────
 실시간       │  realtime-domain-state    ▬▬▬▬▬
   (F)        │  realtime-delta-transport       ▬▬▬
──────────────┼───────────────────────────────────────────────
 인증 (G)     │  lan-direct-auth              ▬▬▬  ●
──────────────┼───────────────────────────────────────────────
 미분류       │  weather-report                     ▬▬
```
- **좌측 셀 = 대분류 라벨(label + key)**, 그 track 의 행들을 **세로로 span**(병합 셀). `│` = 그룹/이니셔티브 구분. `───┼───` = 그룹 divider.
- **오른쪽 = 이니셔티브별 라인** — sprint 바(`▬` = startedAt~endedAt) + 마커(● kickoff / ▲ re-kickoff), 날짜축 눈금(상단 sticky).
- **미분류(track 없음) = 마지막 그룹**("미분류").
- 그룹 순서 = `trackOrder`(profile `## Tracks` 선언 순 + vocab 밖은 최초등장 순 + 미분류 last).

### hover co-highlight
```
 제어 알고리즘 │  control-execution      ▓▓▓▓  ●         ▲   ← 이 행에 hover
   (C) ▓▓▓▓▓▓ │  fsm-authoring-builder        ▬▬▬            (좌 라벨 셀 + 그 행 동시 배경 변화)
```
- sprint 바(또는 그 행)에 마우스 → **그 행 + 왼쪽 대분류 라벨 셀**이 같이 `bg-surface-2`(hover) 로. "이 sprint = 이 대분류" 시각 연결.

## 리스트(plan) — track 섹션 헤더
```
── C · 제어 알고리즘 ──────────────────
  1. control-execution   [active] ← dep
  2. fsm-authoring       [planned]
── F · 실시간 ─────────────────────────
  3. realtime-domain     [active]
── 미분류 ─────────────────────────────
  9. weather-report      [planned]
```
- track 헤더(`key · label`) 아래 그 track 항목(전역 order 유지). 순서 = trackOrder.

## 보드 — track 칩 (그룹핑 X, 2차원 유지)
```
진행 중             착수 가능
┌──────────────┐   ┌──────────────┐
│ control-exec │   │ realtime-... │
│ [C 제어알고]  │   │ [F 실시간]    │  ← 정규화 track 칩 (원문 아닌 {key,label})
│ active ← dep │   │ planned      │
└──────────────┘   └──────────────┘
```
- 카드에 **정규화 track 칩** `[C 제어 알고리즘]`(기존 원문 칩 대체). 상태 3컬럼(진행중/착수가능/선행대기)은 그대로 — track 은 칩으로만.

## 접근성 / 모션
- 그룹 라벨 span = `role="rowgroup"` 또는 aria-label(그룹명). hover co-highlight = CSS(compositor-friendly bg), reduced-motion 무관(색만).
- 색: track 칩·헤더 = `text-muted`/`bg-surface-2`(장식 아닌 라벨). 미분류 = 더 낮은 강조.
