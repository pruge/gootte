---
status: done
priority: normal
initiative: null
area: [web/core]
source: user-report
related: [../roadmap/project-manager/track-grouping/ledger.md, ../roadmap/project-manager/web-dashboard/spec.md]
created: 2026-07-27
completedAt: 2026-07-27
---

# ledger 트랙 프로즈 파서 — 볼드 `**트랙**:` 형식 인식 (미분류 오탐 수리)

> 사용자 보고 (2026-07-27) — jinwooauto 대시보드에 미분류(`__ungrouped__`)가 많다. 조사 결과 미분류 9개 중 6개는 **이미 트랙을 선언**했는데 read-path 가 못 읽는 파서 버그였다.

## 근본 원인
- `core/src/parse/ledger.ts:38` 트랙 프로즈 정규식 `/트랙:\s*([^·\n]+)/` 이 `트랙:` 을 **바로 인접한 콜론**으로만 매칭.
- jinwooauto 원장 다수가 `- **트랙**: F(…)` 처럼 **볼드로 감싼** 형식(`트랙**:`) → 정규식이 놓쳐 `track: null` → 대시보드가 미분류로 오탐.
- 볼드 형식이면서 A–G key 로 시작하는 4개(gateway-bus-hang-fix `F`·heartbeat-watchdog-margin `F`·physical-registry-device-decouple `B`·sensor-global-ctx-link `C`)는 **파서만 고치면 무편집 복구**.

## 수정
- 정규식을 `트랙` 과 콜론 사이 markdown emphasis(`*`/`_`) + 전각 콜론(`：`) 허용으로 완화: `/트랙[*_]*\s*[:：]\s*([^·\n]+)/`.
- 선행 `- ` bullet·볼드는 이미 무관(body 전체 탐색). 값의 선행 `**Track C **` bold/prefix 는 normalizeTrack 이 이미 strip → 무회귀.

## acceptance
- `ledger.test.ts`(신규) 또는 `parse.test.ts` 에 회귀 케이스: `- **트랙**: F(실시간 / 게이트웨이 오케스트레이션)` → `track` = `"F(실시간 / 게이트웨이 오케스트레이션)"`(원문 반환, 정규화는 projection). 비볼드 `- 트랙: G — legacy` 무회귀.
- `pnpm verify`(tsc + vitest) green.
- 라이브 검증: backend 를 jinwooauto 대상으로 띄워 `/api/roadmap/jinwooauto` 의 `__ungrouped__` 가 9 → 3(진짜 트랙-없는 것만) 로 감소.

## 의존
- 없음(순수 core 파서 · web-viz 이미 shipped 의 버그 수리).
