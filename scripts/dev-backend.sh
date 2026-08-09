#!/usr/bin/env bash
# scripts/dev-backend.sh — pnpm dev:backend 진입점. 포트는 scripts/ports.sh(유일한 판정자)가 정한다.
#
# server.ts 의 `PORT ?? 8804` 기본값은 prod(`start`) 진입점 몫으로 그대로 두고,
# dev 경로는 여기서 PORT env 로 해석기 값을 덮어쓴다 → dev 포트의 SoT 는 code/web/.ports.* 다.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORTS_ENV="$("$ROOT_DIR/scripts/ports.sh")" || exit 1
eval "$PORTS_ENV"

cd "$ROOT_DIR"
export PORT="$BACKEND_PORT"
exec pnpm -C code/web/backend run dev
