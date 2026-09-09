#!/usr/bin/env bash
# back-compat shim — worker 오케스트레이션 CLI 는 bin/worker 로 이동했다.
exec "$(cd "$(dirname "$0")/.." && pwd)/bin/worker" "$@"
