#!/usr/bin/env bash
# scripts/tauri-build.sh — pnpm build:tauri 진입점. 완성 .app 을 만든다.
#
# 순서: 프론트엔드 빌드(tsc + vite build → frontend/dist) → tauri build.
# 완성 앱은 release 셸이 hono backend 하나만 자식으로 띄우고 backend 가 dist 까지
# 직접 서빙한다(backend-serves-ui) — vite 자식은 dev(HMR) arm 에만 있다.
# macOS 전용 타깃(bundle.targets = app).

set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/tauri-lib.sh"

pnpm -C "$ROOT_DIR/code/web/frontend" run build

export GOOTTE_TAURI_FRONTEND_MODE=preview
"${TAURI_CLI[@]}" build

echo "✅ .app: $ROOT_DIR/code/web/src-tauri/target/release/bundle/macos/gootte.app"
