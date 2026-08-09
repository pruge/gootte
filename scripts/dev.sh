#!/usr/bin/env bash
# scripts/dev.sh — pnpm dev 진입점. backend + frontend 를 같이 띄운다.
#
# 포트 판정은 각 진입점이 scripts/ports.sh 를 다시 부르므로 여기서는 하지 않는다 —
# 다만 둘을 백그라운드로 띄우면 해석 실패가 로그에 묻히므로, 먼저 한 번 불러 fail-fast 한다.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
"$ROOT_DIR/scripts/ports.sh" >/dev/null || exit 1

"$ROOT_DIR/scripts/dev-backend.sh" &
BACKEND_PID=$!
"$ROOT_DIR/scripts/dev-frontend.sh" &
FRONTEND_PID=$!

# 한쪽이 죽거나 Ctrl-C 가 들어오면 나머지도 같이 정리 (포트를 쥔 좀비 방지).
trap 'kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true' INT TERM EXIT

# `wait -n` 은 bash 4.3+ 이고 macOS 기본 bash 는 3.2 라 쓸 수 없다 → 둘 다 기다린다.
wait "$BACKEND_PID" "$FRONTEND_PID"
