# ADR-0003: AI-access = herdr agent-skill (CLI + SKILL.md + digest), MCP 아님

Status: accepted
Date: 2026-07-24 / 관련: spec.md §Components, profile ## AI access

## Context
AI(세션 넘나드는 Claude)가 "현재/왜/다음"을 세션 부팅에 싸게 얻어야 함. 접근 수단 = MCP 서버 vs herdr식 agent-skill(CLI+SKILL.md). 사용자 지정 = herdr 포맷.

## Decision
**herdr agent-skill 패턴** 채택 (https://herdr.dev/docs/agent-skill/):
- **CLI `gootte`** — `gootte plan/digest/discover`. 관리대상 md SoT 읽어 계산.
- **SKILL.md** — 에이전트에게 "관리 컨텍스트면 `<repo>/.gootte/PLAN.md` 읽거나 `gootte plan .` 호출" 지시.
- **floor = digest 파일**(`<repo>/.gootte/PLAN.md`, 세션 부팅 수동 read, 인프라 0). CLI = live 층.

## Alternatives
- MCP 서버 → 상시 실행·세션 등록 필요, 헤드리스/신규 세션서 취약. 파일 floor 가 더 견고. (2차 웹 backend 가 생기면 그 위에 얹는 건 별개.)

## Consequences
- (+) 인프라 0 — digest 파일은 세션 부팅에 항상 존재. CLI 는 호출 시 최신.
- (+) Claude-native(스킬 시스템).
- (−) live push 없음(파일=스냅샷, CLI=on-demand) — 실시간 push 는 2차 웹 몫.

## Invariant impact
INV-2 — digest 는 `<repo>/.gootte/`(gootte 산출물, AUTO-GENERATED, gitignore). 프로젝트 SoT mutate 아님.

## Contract impact
`Digest` 스키마 = CONTRACT. CLI 출력·digest 파일 동일 타입.
