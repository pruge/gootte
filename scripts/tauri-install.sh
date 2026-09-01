#!/usr/bin/env bash
# scripts/tauri-install.sh — pnpm install:tauri 진입점. **빌드 후 이 컴퓨터에 .app 을 설치한다.**
#
# 1) 프론트엔드 빌드(tsc + vite build → frontend/dist)
# 2) `tauri build` → 완성 .app (`target/release/bundle/macos/gootte.app`)
# 3) 그 .app 을 `/Applications` 로 복사해 **지금 이 컴퓨터**에 설치
#
# 🔴 `setup:tauri`(환경 준비)와 다르다 — 이 스크립트는 실제 산출물(.app)을 만들어 현재
# 시스템에 넣는다. 환경만 갖추고 싶다면 `pnpm setup:tauri`(scripts/tauri-setup.sh).
# 관리대상 문서에는 한 글자도 쓰지 않는다(INV-2).

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/tauri-lib.sh"

APP_NAME="gootte"
APP_BUNDLE="$ROOT_DIR/code/web/src-tauri/target/release/bundle/macos/$APP_NAME.app"
APP_TARGET="/Applications/$APP_NAME.app"

echo "▶ gootte Tauri 빌드 + 설치 — $ROOT_DIR"

# ── 1) 프론트엔드 빌드 ────────────────────────────────────────────────────────
echo "▶ 프론트엔드 빌드 (tsc + vite)…"
pnpm -C "$ROOT_DIR/code/web/frontend" run build

# ── 2) tauri build → .app ─────────────────────────────────────────────────────
echo "▶ tauri build (release .app 생성)…"
export GOOTTE_TAURI_FRONTEND_MODE=preview
"${TAURI_CLI[@]}" build
if [ ! -d "$APP_BUNDLE" ]; then
  echo "✗ .app 을 찾을 수 없다: $APP_BUNDLE" >&2
  exit 1
fi

# ── 3) 현재 컴퓨터에 설치 (/Applications) ────────────────────────────────────
echo "▶ $APP_TARGET 로 설치…"
# 기존 설치본이 실행 중이면(열린 창) 교체가 실패한다 — 이름을 바꿔 두고 교체한다.
if [ -d "$APP_TARGET" ]; then
  echo "  기존 설치본 교체: $APP_TARGET"
fi
if ! ditto "$APP_BUNDLE" "$APP_TARGET" 2>/dev/null; then
  echo "✗ /Applications 에 쓰기 권한이 없다 — 관리자 암호로 다시 실행하거나," >&2
  echo "  직접 복사하세요: cp -R \"$APP_BUNDLE\" \"$APP_TARGET\"" >&2
  exit 1
fi

echo ""
echo "✅ 설치 완료: $APP_TARGET"
echo "   실행: open \"$APP_TARGET\""
echo "   디버그 셸: pnpm dev:tauri"
