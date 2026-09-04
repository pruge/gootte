---
name: gootte-dev-server
description: gootte 의 dev 서버(backend/frontend/tauri)를 띄우거나 내리거나 포트를 다룰 때. 캡틴 사본과 격리 사본의 규율, .ports 판정, GOOTTE_DATA_DIR 격리, 안전한 종료 방법을 담는다. 화면에서 무언가 확인해야 할 때 먼저 읽는다.
---

# gootte dev 서버 — 띄우기 전에 읽는다

## 🔴 세 가지만 지키면 사고가 안 난다

1. **캡틴 사본(`~/Documents/ai2/firstmate2/projects/gootte`, backend 8804 · frontend 5304)의
   dev 서버를 죽이거나 재시작하거나 포트를 헤집지 않는다.**
   그 반대로, **격리 사본의 작업자는 자기 포트로 자기 서버를 스스로 띄우고 자기 것만 내린다.**
   🔴 *"dev 서버는 사용자가 띄운다"* 를 **캡틴이 대신 띄워 준다**는 뜻으로 읽지 마라 —
   그 오독으로 시연이 캡틴 환경에서 돌아 캡틴의 계획 DB 가 오염된 적이 있다(2026-08-14).

2. **`pkill`·`killall` 같은 패턴 종료 금지.** 옆 사본과 캡틴 서버까지 같이 죽는다.
   포트로 PID 를 찾아 그것만 내린다. `tsx watch` 는 죽이면 되살아나므로 **최상위 `pnpm dev` 까지**
   프로세스 트리를 따라 올라가 끊는다.

3. **`GOOTTE_DATA_DIR` 은 포트처럼 자동으로 갈라지지 않는다.** 안 세우면 격리 사본도 캡틴의
   `~/.gootte` 에 쓴다(`backend/src/app.ts` · `cli/src/main.ts` 가 그렇게 떨어진다).
   격리 사본에서 dev 서버나 `gootte` CLI 를 쓸 때는 **그 사본 안의 경로로 직접 지정**한다.

## 캡틴 앱이 이미 떠 있는데 화면을 봐야 한다면

캡틴 포트를 뺏지 말고 **다른 포트 + 다른 데이터 디렉토리**로 따로 띄운다:

```
D=$(mktemp -d); cp ~/.gootte/settings.json "$D/"      # 설정만 복사(계획 DB 는 필요할 때만)
(cd code/web/frontend && VITE_BACKEND_URL=http://localhost:8899 npx vite --port 5399 --strictPort &)
(cd code/web/backend  && GOOTTE_DATA_DIR="$D" PORT=8899 node --import tsx src/server.ts &)
```

끝나면 그 두 포트만 내리고 `$D` 를 지운다.

## 포트는 `scripts/ports.sh` 가 유일한 판정자

- `code/web/.ports.main`(tracked)이 dev 포트의 SoT — backend `8804` / frontend `5304`.
  **포트를 바꿀 땐 이 파일을 고친다.** `vite.config.ts`·`server.ts` 안의 같은 숫자는 사본이다.
- `code/web/.ports.worktree`(gitignore)가 있으면 그 값이 이긴다. **쓰는 주체는 firstmate** —
  에이전트가 만들거나 고치지 않는다.
- 🔴 **둘 다 없거나 값이 이상하면 조용히 기본값으로 넘어가지 않고 오류로 멈춘다.**
  조용한 폴백 = 두 사본이 같은 포트를 쥔 채 아무도 모르는 상태. `pnpm test:ports` 가 이 거절을 지킨다.

## 명령

| 명령 | |
|---|---|
| `pnpm dev` | backend + frontend 동시 |
| `pnpm dev:backend` / `pnpm dev:frontend` | 하나씩 |
| `pnpm dev:stop` | dev 서버 정리 |
| `pnpm dev:tauri` | macOS 데스크톱 셸(자식으로 backend+vite 를 띄운다 — **포트가 비어 있어야 한다**) |
| `pnpm build:tauri` · `pnpm install:tauri` | .app 번들 · 설치 |
| `pnpm e2e` | frontend playwright |

격리 사본에 처음 들어가면 `pnpm setup` 을 한 번(멱등). 복사할 untracked dev secret 은 없다.
