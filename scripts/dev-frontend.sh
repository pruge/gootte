#!/usr/bin/env bash
# scripts/dev-frontend.sh — pnpm dev:frontend 진입점. 포트는 scripts/ports.sh(유일한 판정자)가 정한다.
#
# vite.config.ts 의 server.port(5304) / VITE_BACKEND_URL 기본값은 그대로 두고,
# dev 경로는 여기서 CLI --port 와 VITE_BACKEND_URL 로 덮어쓴다 → 프록시 대상도 같은 해석기 값이라
# 앞단·뒷단 포트 출처가 code/web/.ports.* 하나로 묶인다.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORTS_ENV="$("$ROOT_DIR/scripts/ports.sh")" || exit 1
eval "$PORTS_ENV"

cd "$ROOT_DIR"
export VITE_BACKEND_URL="http://localhost:$BACKEND_PORT"
exec pnpm -C code/web/frontend run dev --port "$FRONTEND_PORT"
