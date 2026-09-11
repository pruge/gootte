#!/usr/bin/env bash
# scripts/kill-port.sh — 지정한 로컬 포트를 점유한 프로세스를 종료한다.
#
# 사용: pnpm kill <port> [<port2> ...]
#   예: pnpm kill 8804

set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "사용법: pnpm kill <port> [<port2> ...]" >&2
  exit 1
fi

for port in "$@"; do
  if ! [[ "$port" =~ ^[0-9]+$ ]]; then
    echo "⚠️  '$port' 는 포트 번호가 아닙니다 — 건너뜀" >&2
    continue
  fi

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"

  if [ -z "$pids" ]; then
    echo "포트 $port: 점유 프로세스 없음"
    continue
  fi

  echo "포트 $port: 프로세스 종료 (pid: $(echo "$pids" | tr '\n' ' '))"
  echo "$pids" | xargs kill -9
done
