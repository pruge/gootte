#!/usr/bin/env bash
# scripts/gootte.sh — `pnpm gootte`/`pnpm discover` 진입점(development-order/15 ④).
#
# 준비 안 된 사본(`pnpm setup` 을 아직 안 돌린 사본)에서 그대로 치면 code/web 의 tsx 가 없어
# `tsx: command not found` 로만 죽는다 — 원인도 다음 할 일도 안 알려준다. 이 급함이 firstmate 첫
# 사용 보고 ①을 일으킨 경위였다(급할 때 실패를 보면 손으로 티켓을 읽어 버린다).
#
# tsx 실행 여부를 실행 전에 먼저 확인해, 없으면 무엇이 없는지와 다음에 칠 명령 한 줄을 그대로
# 보여주고 멈춘다. 있으면 평소처럼 그대로 넘긴다 — 준비된 사본의 동작은 안 바뀐다.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TSX_BIN="$ROOT_DIR/code/web/node_modules/.bin/tsx"

if [ ! -x "$TSX_BIN" ]; then
  echo "gootte: 의존성이 설치돼 있지 않습니다 — 없음: $TSX_BIN" >&2
  echo "다음을 실행하세요: pnpm setup" >&2
  exit 1
fi

cd "$ROOT_DIR"
exec pnpm -s -C code/web gootte "$@"
