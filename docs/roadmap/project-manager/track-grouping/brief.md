# brief — track-grouping (project-manager 2d)

> blueprint 종속 phase. 전체·seam·불변식 = [../blueprint.md](../blueprint.md). 2c([web-viz](../web-viz/)) 위에 **대분류(track) 그룹핑** 레이어.

## 문제 / 의도
2c 뷰(보드·타임라인·리스트)는 이니셔티브·sprint 를 **평평하게** 나열한다. 관리대상(jinwooauto 등)은 실제로 이니셔티브를 **워크스트림(track)** 으로 묶는데(제어 알고리즘·실시간·인증…), 그 대분류가 뷰에서 사라져 "이 sprint/이니셔티브가 **무슨 기능에 속하는지**" 매번 문서를 읽어야 안다. → **track 을 대분류 축으로 복원**해 사람이 "전체 구조"를 한눈에.

## 근본 원인 (실측)
- track 은 관리대상 `ledger.md` 에 **자유 프로즈**(`- 트랙: **Track C 제어 알고리즘** 🔴`)로 적혀, 같은 축이 볼드·이모지·표기차로 **N갈래**(jinwooauto: C 가 3변형, 전체 18변형/7축)로 흩어짐 → 결정적 그룹핑 불가.
- gootte `parseLedger` 는 이미 track 을 프로즈 regex 로 뽑지만 **정규화 없이 원문**을 `PlanItem.track` 에 흘리고, **그룹핑 축으로 쓰지 않음**.

## scope (blueprint 2d 소비)
- **track 정규화** — 원문(프로즈/frontmatter) → canonical `{key,label}` (18변형 → 7축 수렴).
- **label 해소** — 카노니컬 `track: <key>` 는 관리대상 `profile.md` `## Tracks` 어휘에서 label 해소, 레거시 프로즈는 인라인 파생(하이브리드).
- **그룹핑 렌더** — 타임라인: **좌측 대분류 라벨 세로 span + `│` 구분 + 그 track 의 여러 sprint 라인** + hover 시 행·그룹 라벨 co-highlight. 리스트: track 섹션 헤더. 보드: track 칩(2차원이라 재편 X).

## 라이프사이클
관리대상 kickoff 이 ledger 에 track 기록(프레임워크 cling writer 규약 — 별 작업) → gootte 가 read-time 에 정규화·그룹핑. read-only(INV-2).

## 재사용 map (재발명 금지)
- **패턴**: blueprint §③ **external-writer seam**(gootte reader + cling writer 공동소유, 하이브리드=구조화 있으면 읽고 없으면 프로즈 fallback) — `KickoffEvent` 과 **동형**. track 이 두 번째 seam.
- **CONTRACT**: 신규 `Track{key,label}` (seam) · `PlanItem.track`(string→`Track`) · `GanttRow` 에 track 추가 · `TimelineResponse/PlanResponse` 에 `trackOrder` 추가.
- **CORE parse**: `parse/ledger.ts` track 파싱 확장(frontmatter 우선 + 프로즈 fallback) · 신규 순수 `normalizeTrack`·`parseProfileTracks`.
- **CORE state/projection**: `ProjectState.tracks`(vocab map) · `buildPlan/buildKanban/buildGantt` 가 정규화 track 부착 + trackOrder 산출(재발명 X — 기존 projection 에 축만 얹음).
- **core-io**: `load.ts` 가 `<project>/.cling/profile.md` `## Tracks` 읽어 vocab(신규 read surface, INV-2 안전).
- **frontend**: `TimelineChart`·`PlanView`·`BoardCard` 에 그룹/칩 렌더만 추가.
- **cling write-side (이미 편집 완료)**: `## Tracks` 어휘 + ledger `track:` frontmatter = 이 reader 의 write 짝(통합 리뷰가 정합 검증).

## non-goal (2d)
- 보드 track 스윔레인 재편(2차원 matrix — future 토글) · track 편집(read-only, INV-2) · epic 2단 대분류(track 단일로 충분, YAGNI) · cling writer 정형화 강제(레거시 프로즈 fallback 으로 흡수, backfill 은 기회적).

## future
- 보드 "group by track" 토글 · track 위 epic 계층(필요 시).

## ADR 색인
- [ADR-0001](adr/0001-track-external-writer-seam.md) — track = external-writer seam (하이브리드 파싱, KickoffEvent 동형)
- [ADR-0002](adr/0002-profile-tracks-label-resolution.md) — label 해소 = profile `## Tracks` 어휘(카노니컬) + 프로즈 fallback(레거시)
- [ADR-0003](adr/0003-timeline-grouped-layout.md) — 타임라인 좌측 대분류 span 레이아웃 + hover co-highlight
