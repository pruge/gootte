# Specification — backend 가 UI 를 서빙하고 vite 자식을 없앤다

## Goal

Tauri가 띄우는 자식에서 vite(frontend 프로세스, ~200MB)를 없앤다.
backend(hono)가 빌드된 `frontend/dist` 를 직접 서빙하고, 창은 backend 를 본다.

## User stories

1. S1 — 설치 앱을 켜면 프로세스가 `gootte-desktop` + `gootte-server` 둘만 뜬다(vite 없음).
2. S2 — 화면·실시간(WS `/api/live`)·API 가 이전과 똑같이 동작한다(프론트 코드는 상대경로만 쓰므로 same-origin 으로 그대로 돈다).
3. S3 — `pnpm dev`(웹 dev: backend + vite dev HMR)와 e2e 는 그대로 된다.
4. S4 — dist 가 없는데 서빙 모드로 뜨면 조용히 낡은 화면 대신 큰 소리로 멈춘다.
5. S5 — 각 변경 뒤 verify gate 가 green 이다.

## Scope

- `mountFallback` 확장: flag + dist 존재 시 정적 서빙, 없으면 기존 placeholder.
- `main.rs` preview arm: vite 자식 삭제, 창 URL → backend 포트.
- `FrontendMode`·`GOOTTE_TAURI_FRONTEND_MODE`·`VITE_BACKEND_URL`·`proc-title` 프론트 배선 정리.
- 스크립트 주석(`tauri-build.sh` 등) 현실화.

## Out of scope

- `pnpm dev`·`dev-frontend.sh`·e2e 의 vite dev — HMR 개발 경로는 유지한다.
- `ports.sh`·`.ports.*` 형식 — dev/e2e 가 여전히 FRONTEND_PORT 를 쓰므로 그대로 둔다.
- 컴파일드 JS 전환·워커 캐시 — 별도 과제.
- Linux/Windows — 현 mac 전용 그대로.

## Decisions

- D1 — 분류는 Planned(expand → migrate → contract). grill 면제 — 목적지·seam 이 분명하고, 남은 선택지는 아래에 잠근다.
- D2 — seam 은 `mountFallback`(app.ts) 하나다. spec 주석이 "Phase 5는 여기서 확장" 이라고 이미 가리킨다.
- D3 — 서빙은 flag(`GOOTTE_SERVE_DIST=1`, main.rs 가 preview arm 에서만 건넴) + dist 존재 때만. dev backend·e2e backend 는 기존 placeholder 그대로 — 낡은 dist 를 조용히 서빙하는 사고를 막는다.
- D4 — SPA 폴백은 최소: 정확한 파일 + `/`→index.html, 그 외 404. 앱에 deep link 가 없어(쿼리 파라미터만 쓴다) rewrite 는 두지 않는다.
- D5 — WS `/api/live` 등록이 캐치올보다 먼저라는 기존 순서 규칙을 유지한다(깨지면 실시간이 죽는다).
- D6 — INV-1: 서빙하는 dist 는 빌드 파생물이다. 손으로 고치지 않고 `frontend build` 로만 만든다.
- D7 — e2e 는 dev 서버 구성을 유지한다(preview 서빙 경로는 backend 단위 테스트 + 수동 `dev:tauri` 로 커버).
- D8 — `FrontendMode` enum 자체를 삭제한다(preview arm 이 사라지면 mode 가 가릴 게 없다). `tauri-dev.sh` 의 env 지정도 함께 삭제.

## Existing seams / integration points

- `mountFallback(app)` — backend 정적 서빙의 한 자리.
- `spawn_children`·`wait_listening`·`StackConfig`·창 URL (main.rs).
- 포트 SoT `scripts/ports.sh` — 읽기만 하고 형식은 안 건든다.
- 프론트 `BASE=""`·`liveUrl()` — same-origin 전제라 손대지 않는다.

## Data and migration

- 저장 값 없음. 마이그레이션 없음. dist 는 빌드 때마다 재생성된다.

## Security / authorization

- 로컬 루프백 전용 그대로. 서빙 루트를 dist 밖으로 못 벗어나게 한다(경로 탈출 금지 — serve-static 루트 고정).
- 새 외부 입력·권한 없음.

## Compatibility / rollout

- T01(expand, flag off 기본 → 무동작) → T02(migrate, preview arm 전환) → T03(contract, 구 코드 삭제) 순.
- T02 뒤에는 설치 앱이 vite 없이 돌아가야 한다 — 수동 `dev:tauri` + 설치 빌드 확인은 캡틴 환경에서 한다.

## Acceptance criteria

- A1 — 설치 앱 프로세스에서 vite(`gootte-front`)가 없다.
- A2 — `/` → UI, `/api/projects` → JSON, WS `/api/live` 연결이 된다.
- A3 — dist 없음 + 서빙 모드 = 기동 실패(큰 소리).
- A4 — `pnpm dev`·e2e 구성이 그대로 동작한다.
- A5 — `pnpm verify` + `cargo check`·`clippy` green.

## Verification strategy

- backend 단위·계약 테스트(픽스처 dist + env 오버라이드, `app.request` 로 `/`·`/api`·WS 순서 회귀).
- Rust 는 `cargo check` + `clippy -- -D warnings` (테스트 하네스 없음).
- preview 실기동(GUI)은 캡틴 환경 수동 확인.
