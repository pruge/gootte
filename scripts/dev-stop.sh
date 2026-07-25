#!/usr/bin/env bash
# gootte dev 서버 완전 정지 — main·모든 worktree 의 backend(tsx watch supervisor+worker) + frontend(vite).
#
# 왜 필요한가: `tsx watch` 는 supervisor + worker 2프로세스라, supervisor 만 죽이면 worker 가
# 포트를 쥔 채 남고, worker 만 죽이면 supervisor 가 respawn 한다. 아래는 순서대로 둘 다 잡고
# 포트를 backstop 으로 강제 해제한다. worktree 가 삭제돼도 좀비로 남던 서버까지 청소.
#
# 사용: pnpm dev:stop        (기본 포트 8787·5173)
#       pnpm dev:stop 8899   (추가 포트 지정 가능)

set -uo pipefail

PORTS=("$@")
[ ${#PORTS[@]} -eq 0 ] && PORTS=(8787 5173)

# 1) supervisor + worker + vite 를 한 번에 (프로젝트 경로 스코프 — 다른 프로젝트 무영향).
#    worker cmdline 도 `tsx/dist/preflight` + 프로젝트 경로를 포함하므로 같은 pkill 로 잡힌다.
pkill -f "gootte/.*code/web/.*(server\.ts|tsx/dist/preflight|vite/bin/vite)" 2>/dev/null || true
sleep 0.6

# 2) 포트 backstop — 위에서 안 잡힌 잔여가 있으면 포트 점유 PID 강제 종료.
for p in "${PORTS[@]}"; do
  pids=$(lsof -ti "tcp:${p}" 2>/dev/null || true)
  [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
done
sleep 0.3

# 3) 확인 보고.
busy=""
for p in "${PORTS[@]}"; do
  lsof -ti "tcp:${p}" >/dev/null 2>&1 && busy="$busy $p"
done
if [ -n "$busy" ]; then
  echo "⚠️  아직 점유 중:$busy (권한/외부 프로세스일 수 있음)"
  exit 1
fi
echo "✅ dev 서버 정지 · 포트 ${PORTS[*]} 확보"
