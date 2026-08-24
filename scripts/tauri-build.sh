#!/usr/bin/env bash
# scripts/tauri-build.sh — pnpm tauri:build 진입점. 완성 .app 을 만든다.
#
# 순서: 프론트엔드 빌드(tsc + vite build → frontend/dist) → tauri build.
# 완성 앱은 release 셸이 vite preview(dist 서빙 + /api·WS 프록시)와 hono backend 를
# 자식으로 띄운다 — macOS 전용 타깃(bundle.targets = app).

set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/tauri-lib.sh"

pnpm -C "$ROOT_DIR/code/web/frontend" run build

export GOOTTE_TAURI_FRONTEND_MODE=preview
$TAURI_CLI build

echo "✅ .app: $ROOT_DIR/code/web/src-tauri/target/release/bundle/macos/gootte.app"
