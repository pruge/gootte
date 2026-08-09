#!/usr/bin/env bash
# scripts/tests/ports.test.sh — scripts/ports.sh 판정 로직 검증 (worktree > main > 에러).
#
# 실 저장소의 code/web/.ports.* 를 건드리지 않고 PORTS_ROOT_DIR 로 임시 fixture 를 가리켜 검증.
#
# 사용: pnpm test:ports  (= bash scripts/tests/ports.test.sh)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORTS_SH="$ROOT_DIR/scripts/ports.sh"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$TMP_DIR/code/web"

fail() {
  echo "❌ FAIL: $1" >&2
  exit 1
}

# case 1: .ports.worktree 가 있으면 그 값을 낸다 (.ports.main 도 같이 있어도 worktree 우선)
cat >"$TMP_DIR/code/web/.ports.main" <<'EOF'
BACKEND_PORT=8804
FRONTEND_PORT=5304
EOF
cat >"$TMP_DIR/code/web/.ports.worktree" <<'EOF'
BACKEND_PORT=8812
FRONTEND_PORT=5312
EOF

OUT=$(PORTS_ROOT_DIR="$TMP_DIR" bash "$PORTS_SH" 2>"$TMP_DIR/stderr.log")
grep -q '^BACKEND_PORT=8812$' <<<"$OUT" || fail "worktree case: BACKEND_PORT 불일치"
grep -q '^FRONTEND_PORT=5312$' <<<"$OUT" || fail "worktree case: FRONTEND_PORT 불일치"
grep -q '^ports: worktree ' "$TMP_DIR/stderr.log" || fail "worktree case: 상태 줄 없음/라벨 오류"
echo "✅ case 1 (격리 사본용 파일이 이긴다) OK"

# case 2: .ports.worktree 가 없으면 .ports.main 값을 낸다
rm "$TMP_DIR/code/web/.ports.worktree"
OUT=$(PORTS_ROOT_DIR="$TMP_DIR" bash "$PORTS_SH" 2>"$TMP_DIR/stderr.log")
grep -q '^BACKEND_PORT=8804$' <<<"$OUT" || fail "main case: BACKEND_PORT 불일치"
grep -q '^FRONTEND_PORT=5304$' <<<"$OUT" || fail "main case: FRONTEND_PORT 불일치"
grep -q '^ports: main ' "$TMP_DIR/stderr.log" || fail "main case: 상태 줄 없음/라벨 오류"
echo "✅ case 2 (메인용 파일만 있으면 메인 값) OK"

# case 3: 둘 다 없으면 조용히 기본값으로 넘어가지 않고 명확한 오류로 멈춘다.
#   이 케이스가 이 스크립트 설계의 핵심 — 폴백하는 순간 두 사본이 같은 포트를 쓰고도 아무도 모른다.
rm "$TMP_DIR/code/web/.ports.main"
if PORTS_ROOT_DIR="$TMP_DIR" bash "$PORTS_SH" >"$TMP_DIR/stdout.log" 2>"$TMP_DIR/stderr.log"; then
  fail "설정 없음 case: 성공하면 안 됨(조용한 기본값 폴백 감지)"
fi
[ -s "$TMP_DIR/stderr.log" ] || fail "설정 없음 case: 에러 메시지 없음"
if [ -s "$TMP_DIR/stdout.log" ]; then fail "설정 없음 case: 실패했는데 포트 값을 냈음(기본값 폴백)"; fi
grep -q '\.ports\.worktree' "$TMP_DIR/stderr.log" || fail "설정 없음 case: 무엇이 없는지(.ports.worktree) 안 말함"
grep -q '\.ports\.main' "$TMP_DIR/stderr.log" || fail "설정 없음 case: 무엇이 없는지(.ports.main) 안 말함"
echo "✅ case 3 (둘 다 없음 → 기본값 아닌 오류) OK"

# case 4: 파일은 있지만 값이 비면 역시 명확한 오류로 멈춘다
cat >"$TMP_DIR/code/web/.ports.main" <<'EOF'
BACKEND_PORT=
FRONTEND_PORT=5304
EOF
if PORTS_ROOT_DIR="$TMP_DIR" bash "$PORTS_SH" >"$TMP_DIR/stdout.log" 2>"$TMP_DIR/stderr.log"; then
  fail "빈 값 case: 성공하면 안 됨"
fi
[ -s "$TMP_DIR/stderr.log" ] || fail "빈 값 case: 에러 메시지 없음"
if [ -s "$TMP_DIR/stdout.log" ]; then fail "빈 값 case: 실패했는데 포트 값을 냈음"; fi
echo "✅ case 4 (빈 값 → 오류) OK"

# case 5: 키 자체가 없어도 (grep 미매치) 조용히 죽지 않고 에러 메시지를 남긴다
cat >"$TMP_DIR/code/web/.ports.main" <<'EOF'
FRONTEND_PORT=5304
EOF
if PORTS_ROOT_DIR="$TMP_DIR" bash "$PORTS_SH" >/dev/null 2>"$TMP_DIR/stderr.log"; then
  fail "키 누락 case: 성공하면 안 됨"
fi
[ -s "$TMP_DIR/stderr.log" ] || fail "키 누락 case: 에러 메시지 없음(grep 미매치로 조용히 죽음)"
echo "✅ case 5 (키 누락 → 에러 메시지 동반) OK"

# case 6: 숫자가 아닌 값은 통과시키지 않는다 (PORT env / vite --port / eval 로 흘러가므로)
cat >"$TMP_DIR/code/web/.ports.main" <<'EOF'
BACKEND_PORT=8804; echo pwned
FRONTEND_PORT=5304
EOF
if PORTS_ROOT_DIR="$TMP_DIR" bash "$PORTS_SH" >"$TMP_DIR/stdout.log" 2>"$TMP_DIR/stderr.log"; then
  fail "비숫자 case: 성공하면 안 됨"
fi
[ -s "$TMP_DIR/stderr.log" ] || fail "비숫자 case: 에러 메시지 없음"
if grep -q 'pwned' "$TMP_DIR/stdout.log"; then fail "비숫자 case: 주입된 명령이 stdout 으로 새어나감"; fi
echo "✅ case 6 (비숫자 값 → 오류) OK"

# case 7: CRLF 로 쓰인 파일도 CR 없는 순수 숫자로 정규화된다
printf 'BACKEND_PORT=8812\r\nFRONTEND_PORT=5312\r\n' >"$TMP_DIR/code/web/.ports.main"
OUT=$(PORTS_ROOT_DIR="$TMP_DIR" bash "$PORTS_SH" 2>/dev/null)
grep -q '^BACKEND_PORT=8812$' <<<"$OUT" || fail "CRLF case: BACKEND_PORT 에 CR 잔류/불일치"
grep -q '^FRONTEND_PORT=5312$' <<<"$OUT" || fail "CRLF case: FRONTEND_PORT 에 CR 잔류/불일치"
echo "✅ case 7 (CRLF → 정규화) OK"

# case 8: 추적되는 code/web/.ports.main 이 실제로 8804/5304 를 담는다 (메인 사본 기대값 고정).
#   위 케이스들은 임시 fixture 를 쓰므로, 실 파일 값은 여기서 한 번 읽기 전용으로 확인한다.
grep -q '^BACKEND_PORT=8804$' "$ROOT_DIR/code/web/.ports.main" || fail "실 .ports.main: BACKEND_PORT 가 8804 아님"
grep -q '^FRONTEND_PORT=5304$' "$ROOT_DIR/code/web/.ports.main" || fail "실 .ports.main: FRONTEND_PORT 가 5304 아님"
echo "✅ case 8 (추적된 .ports.main = 8804/5304) OK"

echo "✅ scripts/ports.sh 전체 통과"
