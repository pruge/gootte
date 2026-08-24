#!/usr/bin/env bash
# scripts/tauri-lib.sh — tauri dev/build 진입점의 공통 절반.
#
# 포트·루트 판정은 Rust 셸이 스스로 한다(scripts/ports.sh 규칙을 그대로 옮겨 놓았다) —
# 이 스크립트는 모드만 정해서 넘기고 tauri CLI 에게 실행을 맡긴다. 웹 경로(scripts/dev*)와
# 같은 .ports.* 를 보므로 출처가 하나로 묶인다.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# 포트 해석을 미리 한 번 돌려 fail-fast — 실패가 tauri/cargo 로그에 묻히지 않게.
PORTS_ENV="$("$ROOT_DIR/scripts/ports.sh")" || exit 1
eval "$PORTS_ENV"

export GOOTTE_TAURI_ROOT="$ROOT_DIR"
TAURI_CLI="pnpm -C $ROOT_DIR/code/web exec tauri"
