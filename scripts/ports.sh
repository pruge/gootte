#!/usr/bin/env bash
# scripts/ports.sh — dev 포트 해석기. 이것이 유일한 판정자다.
#
# code/web/.ports.worktree 가 있으면 그 값, 없으면 code/web/.ports.main 값을 쓴다.
# 판정은 **파일 존재 여부만** 본다 — 작업 사본 경로를 캐묻지 않는다. 메인 사본에는
# .ports.worktree 가 없으므로(gitignore) 자동으로 main 값으로 갈린다.
#
# 포트 "배정"은 firstmate 가 격리 사본을 만들 때 한다 — 이 저장소는 배정된 값을 읽기만 한다.
# 둘 다 없거나 값이 비었거나 숫자가 아니면 **조용히 기본값으로 넘어가지 않고** 무엇이 없는지
# 말하며 멈춘다. 조용한 폴백 = 두 사본이 같은 포트를 쓰면서 아무도 모르는 상태.
#
# 사용 (호출 측에서 capture → 상태 확인 → eval):
#   PORTS_ENV="$(scripts/ports.sh)" || exit 1
#   eval "$PORTS_ENV"
#   echo "$BACKEND_PORT" "$FRONTEND_PORT"
#
# eval "$(...)" 로 바로 쓰면 eval 의 상태만 남아 이 스크립트의 실패가 삼켜진다
# (나중에 set -u 의 "unbound variable" 로만 드러남) → 반드시 capture 후 상태를 본다.
#
# stdout = eval 가능한 대입문 (BACKEND_PORT=.. / FRONTEND_PORT=..)
# stderr = 어느 설정을 쓰는지 한 줄 — 예: "ports: worktree (backend 8812 / frontend 5312)"
#
# 테스트: scripts/tests/ports.test.sh (PORTS_ROOT_DIR 로 임시 fixture 를 가리켜 실 저장소 파일은 안 건드림)

set -euo pipefail

ROOT_DIR="${PORTS_ROOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PORTS_DIR="$ROOT_DIR/code/web"
WORKTREE_FILE="$PORTS_DIR/.ports.worktree"
MAIN_FILE="$PORTS_DIR/.ports.main"

if [ -f "$WORKTREE_FILE" ]; then
  SOURCE_FILE="$WORKTREE_FILE"
  SOURCE_LABEL="worktree"
elif [ -f "$MAIN_FILE" ]; then
  SOURCE_FILE="$MAIN_FILE"
  SOURCE_LABEL="main"
else
  echo "❌ ports: $WORKTREE_FILE 도 $MAIN_FILE 도 없음 — 포트 설정 파일 없이 진행 불가" >&2
  exit 1
fi

# 키가 아예 없으면 grep 이 1 로 끝나 pipefail+set -e 가 여기서 조용히 죽는다(메시지 0바이트)
# → `|| true` 로 상태를 흡수하고 실패 판정은 아래 guard 가 전담한다.
# 값은 CR/공백을 털어(CRLF 파일 대응) 숫자만 남긴다.
BACKEND_PORT=$(grep -E '^BACKEND_PORT=' "$SOURCE_FILE" | tail -1 | cut -d= -f2- | tr -d '[:space:]' || true)
FRONTEND_PORT=$(grep -E '^FRONTEND_PORT=' "$SOURCE_FILE" | tail -1 | cut -d= -f2- | tr -d '[:space:]' || true)

if [ -z "$BACKEND_PORT" ] || [ -z "$FRONTEND_PORT" ]; then
  echo "❌ ports: $SOURCE_FILE 에 BACKEND_PORT/FRONTEND_PORT 누락 또는 빈 값" >&2
  exit 1
fi

# 값은 PORT env / vite --port 로 흘러가고 호출 측에서 eval 된다 → 숫자만 통과.
if ! [[ "$BACKEND_PORT" =~ ^[0-9]+$ ]] || ! [[ "$FRONTEND_PORT" =~ ^[0-9]+$ ]]; then
  echo "❌ ports: $SOURCE_FILE 의 포트 값이 숫자가 아님 (BACKEND_PORT='$BACKEND_PORT' FRONTEND_PORT='$FRONTEND_PORT')" >&2
  exit 1
fi

echo "ports: $SOURCE_LABEL (backend $BACKEND_PORT / frontend $FRONTEND_PORT)" >&2

echo "BACKEND_PORT=$BACKEND_PORT"
echo "FRONTEND_PORT=$FRONTEND_PORT"
