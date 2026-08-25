#!/usr/bin/env bash
# scripts/tauri-dev.sh — pnpm dev:tauri 진입점. 데스크톱 셸을 debug 로 띄운다.
#
# 창·백엔드·프론트엔드 수명은 전부 Rust 셸(src-tauri)이 관리한다 — 이 스크립트는
# 모드(dev = vite HMR 서버)만 고정하고 tauri CLI 에 실행을 넘긴다. 웹 실행 대안은
# 종전대로 `pnpm dev` 다(scripts/dev.sh, 여기서 손대지 않는다).

set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/tauri-lib.sh"

export GOOTTE_TAURI_FRONTEND_MODE=dev
exec "${TAURI_CLI[@]}" dev
