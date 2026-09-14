#!/usr/bin/env bash
# scripts/tests/allocate-worktree-ports.test.sh — 격리 사본 포트 배정기 검증.
#
# 실제 소켓을 열지 않는다 — port_is_busy 를 갈아끼워 "사용 중" 을 흉내낸다(이 기계에 뭐가 떠
# 있든 결과가 흔들리면 안 되므로). 배정기는 순수 함수라 임시 디렉토리로 충분히 검증된다.
#
# 사용: pnpm test:ports  (= bash scripts/tests/allocate-worktree-ports.test.sh)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=../lib/allocate-worktree-ports.sh
source "$ROOT_DIR/scripts/lib/allocate-worktree-ports.sh"

fail() {
  echo "❌ FAIL: $1" >&2
  exit 1
}

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# 기본은 "아무 포트도 안 쓴다" 로 고정 — 리스너 판정은 case 6 에서 따로 흉내낸다.
busy() { return 1; }
port_is_busy() { busy "$1"; }

# case 1: 아무도 안 쓰면 첫 슬롯
OUT="$(allocate_worktree_ports "")"
[ "$OUT" = "$(printf 'BACKEND_PORT=8812\nFRONTEND_PORT=5306')" ] || fail "빈 상태 첫 슬롯: $OUT"

# case 2: FRONTEND 는 항상 짝수 — STUDIO_PORT = FRONTEND+1 규약이 무너지면 안 된다
for claimed in "" "5306" "5306
5310" "8812
8822"; do
  F="$(allocate_worktree_ports "$claimed" | grep FRONTEND_PORT | cut -d= -f2)"
  [ $((F % 2)) -eq 0 ] || fail "FRONTEND_PORT 가 홀수: $F (claimed=$claimed)"
done

# case 3: 이미 배정된 슬롯은 건너뛴다
OUT="$(allocate_worktree_ports "$(printf '8812\n5306')")"
[ "$OUT" = "$(printf 'BACKEND_PORT=8822\nFRONTEND_PORT=5310')" ] || fail "claimed 회피: $OUT"

# case 4: 🔴 스튜디오 몫(frontend+1)이 배정 기록에 이미 있으면 그 슬롯 전체를 피한다
OUT="$(allocate_worktree_ports "5307")"
[ "$OUT" = "$(printf 'BACKEND_PORT=8822\nFRONTEND_PORT=5310')" ] || fail "studio 몫 회피: $OUT"

# case 5: 🔴 캡틴 사본의 포트(8804/5304) 는 배정 대상으로 절대 나오지 않는다.
# 이것이 무너지면 "격리 사본이 캡틴 서버와 같은 포트를 쥔 채 아무도 모른다"(AGENTS.md 금지 사고).
n=1
while [ "$n" -le 60 ]; do
  b=$((8802 + 10 * n))
  f=$((5302 + 4 * n))
  for cap in 8804 5304; do
    { [ "$b" = "$cap" ] || [ "$f" = "$cap" ] || [ $((f + 1)) = "$cap" ]; } && fail "슬롯 n=$n 이 캡틴 포트($cap) 와 겹친다: be=$b fe=$f"
  done
  n=$((n + 1))
done

# case 6: 리스너가 물린 슬롯은 배정 기록에 없어도 건드리지 않는다 — frontend 당과 studio 당 둘 다
busy() { [ "$1" = "5306" ]; }
OUT="$(allocate_worktree_ports "")"
[ "$OUT" = "$(printf 'BACKEND_PORT=8822\nFRONTEND_PORT=5310')" ] || fail "busy frontend 회피: $OUT"

busy() { [ "$1" = "5307" ]; } # n=1 의 studio 몫만 물림
OUT="$(allocate_worktree_ports "")"
[ "$OUT" = "$(printf 'BACKEND_PORT=8822\nFRONTEND_PORT=5310')" ] || fail "busy studio 회피: $OUT"

busy() { [ "$1" = "5311" ]; } # n=2 의 studio 몫이 물림 + n=1 은 배정 기록에 있음 → n=3
OUT="$(allocate_worktree_ports "5306")"
[ "$OUT" = "$(printf 'BACKEND_PORT=8832\nFRONTEND_PORT=5314')" ] || fail "claimed+busy 겹침 회피: $OUT"

busy() { return 1; }

# case 7: ports_claimed 는 worktree·main 설정을 모아 '한 줄에 포트 하나' 로 낸다
# (개행까지 tr 로 지우면 "88125306" 한 덩어리가 되어 회피가 조용히 죽는다 — 실측 함정)
mkdir -p "$TMP_DIR/a/code/web" "$TMP_DIR/b/code/web"
printf 'BACKEND_PORT=8812\nFRONTEND_PORT=5306\n' >"$TMP_DIR/a/code/web/.ports.worktree"
printf 'BACKEND_PORT=8804\r\nFRONTEND_PORT=5304\r\n' >"$TMP_DIR/b/code/web/.ports.main"
CLAIMED="$(ports_claimed "$TMP_DIR/a" "$TMP_DIR/b" | tr '\n' ' ')"
[ "$CLAIMED" = "8812 5306 8804 5304 " ] || fail "ports_claimed 집계: [$CLAIMED]"
# 집계 값을 배정기에 그대로 먹이면 첫 슬롯(8812/5306) 을 건너뛴다 — 두 함수가 이어붙는다
OUT="$(allocate_worktree_ports "$(ports_claimed "$TMP_DIR/a" "$TMP_DIR/b")")"
[ "$OUT" = "$(printf 'BACKEND_PORT=8822\nFRONTEND_PORT=5310')" ] || fail "claimed → allocate 연결: $OUT"

echo "✅ allocate-worktree-ports: 7 case 통과"
