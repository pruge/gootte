---
name: gootte
description: 이 저장소가 gootte 로 관리되는 cling 프로젝트일 때, 세션 부팅에 "현재 개발 순서 + 왜"를 즉시 파악한다. `.gootte/PLAN.md`(생성된 digest)를 읽거나 `gootte plan .` 을 호출한다. re-kickoff 연쇄로 "지금 뭘 먼저 해야 하나"가 흐릿할 때 사용.
---

# gootte — 개발 순서/왜 (agent-skill)

이 프로젝트가 gootte 로 관리되면(루트에 `.gootte/` 또는 `.cling/profile.md` 존재), **세션 시작에 다음 할일을 재도출(`cling:sprint` 재스캔)하지 말고** gootte 의 계산된 plan 을 읽는다.

## 언제
- 세션 부팅 / 컨텍스트 클리어 후 "현재 어디, 왜, 다음 뭐" 파악.
- 연쇄 re-kickoff 로 이니셔티브가 뒤엉켜 순서가 불명할 때.

## 어떻게 (우선순위)
1. **floor (인프라 0)** — `.gootte/PLAN.md` 가 있으면 읽는다. "개발해야 할 순서(full) + 왜"(NOW 마커·방치비용·정지점·blocked)가 들어있다.
2. **live** — 최신이 필요하거나 파일이 없으면 `gootte plan .` (또는 `pnpm gootte plan <repo>`) 을 호출해 그 자리에서 재계산.
3. digest 갱신 = `gootte digest .` → `.gootte/PLAN.md` 재생성(AUTO-GENERATED, 손편집 X).

## 규율
- **gootte 는 읽기 전용** — 관리대상 cling 문서(ledger/spec/todo)를 mutate 하지 않는다. `.gootte/` 만 gootte 생성물.
- plan 은 md SoT 파생 — 문서가 바뀌면 `gootte plan` 이 다시 계산(stale 없음).
- 순서/근거는 계산값(DAG·priority·git divergence). "왜"의 trigger 만 ledger `## events`(있으면)/산문에서.
