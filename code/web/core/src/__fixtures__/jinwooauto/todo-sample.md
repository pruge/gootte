---
created: 2026-06-18
status: pending
priority: low
domain: weather
source: user-report
sprint: null
initiative: weather-report-per-site          # ledger 이니셔티브 back-pointer (backfill)
area: [web/backend, app/operator]
tags: [weather, operator-app, backend]
related:
  - weather-report-value-design
---

# 날씨 보고서 — 사이트별 생성 (현재 = 농가 단위)

> 사용자 보고 (2026-06-18) — 멜론 날씨 보고서 sprint 중 발견. "검증농가1에 사이트가 여러개인데 사이트별로 생성하나?" → 현재는 농가 단위. **개발 제외, 추후 필요 판단 시 진행.**

## 현황 (조사 — 농가 단위로 확정 구현됨)
- `scheduled.ts` `listReportTargets` 가 farm 당 **대표 사이트 1개**(가장 먼저 생성된 lat/lng 보유 site)만 골라 그 grid 로 KMA fetch.
- 보고서 id = `wr-<date>-<farmId>` (farmId 기준 1건). 같은 농가 다른 사이트는 별도 보고 없음.
- 예: 검증농가1(f-9c76f26d) 사이트 3개(어룡리 63/113, 복모리 62/113, 화요일 63/111) → 보고 1건, 대표(어룡리/복모리) 날씨. 화요일(~10km 남쪽)은 근사.
- **INV-1 위배 아님** — INV-1은 *제어 스코프*(gateway/PLC) site 격리. 날씨 보고는 *정보 제공*(farm 레벨)이라 농가 단위 정합. 기존 spec(`날씨 리포트.md`)도 farm 단위.

## 보류 이유 (2026-06-18)
- 검증농가1 세 사이트가 KMA 5km 격자 기준 인접(어룡리·복모리 동일/인접, 화요일 ~2칸) → 농가 단위로 충분, 사이트별 가치 낮음.
- 사이트가 지리적으로 멀어 날씨가 유의미하게 갈리는 농가가 실제 등장하면 그때 재검토.

## 다음 단계 결정 필요 (필요 판단 시 sprint 화)
- **트리거 신호** — 사이트 간 grid 차이가 큰(예: 다른 시군구) 농가 등장 + 운영자가 사이트별 날씨 차이를 실제로 필요로 함.
- **저장 키** — `wr-<date>-<farmId>` → `wr-<date>-<siteId>` (또는 farm 보고 안에 site 배열). 마이그레이션·purge 로직 동반.
- **KMA 호출량** — 사이트마다 grid fetch → rate limit·캐시 키(현 grid 단위 캐시 `weather-cache` 재사용 가능, 같은 grid 사이트는 공유).
- **operator UI** — 보고서 sub-tab 에 사이트 선택(현 종합/시간별 탭의 `WeatherSitePickerDialog` 패턴 재사용 가능) vs 사이트별 카드 나열.
- **push** — 농가 1회 vs 사이트별 (과다 알림 주의).

## 관련
- sprint: `2026-06-18-weather-report-value-design` (농가 단위 hazard 보고서 구현 — 본 todo 가 그 후속 분기)
- 코드: `scheduled.ts`(listReportTargets/runWeatherReportCron), `handlers/weather-report.ts`(GET), `weather-cache.ts`(grid 단위 캐시)
- spec: `docs/roadmap/날씨 리포트.md`
