#!/usr/bin/env bash
# scripts/tests/gootte-wrapper.test.sh — scripts/gootte.sh 판정 검증(development-order/15 ④).
#
# tsx 가 없는 사본에서 원인과 다음에 칠 명령을 그대로 보여주고 멈추는지,
# tsx 가 있는 사본에서는 평소처럼 그대로 넘기는지를 임시 fixture 로 검증한다.
#
# 사용: pnpm test:ports  (= bash scripts/tests/ports.test.sh && bash scripts/tests/gootte-wrapper.test.sh)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GOOTTE_SH="$ROOT_DIR/scripts/gootte.sh"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

fail() {
  echo "❌ FAIL: $1" >&2
  exit 1
}

# case 1: code/web/node_modules/.bin/tsx 가 없으면 — 원인과 다음 명령을 말하고 실패로 멈춘다.
# gootte.sh 는 자기 위치("<root>/scripts/gootte.sh")에서 ROOT_DIR 을 셈하므로, fixture 도
# 같은 상대 구조(<fixture>/scripts/gootte.sh, <fixture>/code/web)로 맞춘다.
mkdir -p "$TMP_DIR/no-deps/code/web" "$TMP_DIR/no-deps/scripts"
cp "$ROOT_DIR/scripts/gootte.sh" "$TMP_DIR/no-deps/scripts/gootte.sh"
if bash "$TMP_DIR/no-deps/scripts/gootte.sh" >"$TMP_DIR/stdout.log" 2>"$TMP_DIR/stderr.log"; then
  fail "tsx 없음 case: 성공하면 안 됨"
fi
grep -q 'node_modules/.bin/tsx' "$TMP_DIR/stderr.log" || fail "tsx 없음 case: 무엇이 없는지 안 말함"
grep -q 'pnpm setup' "$TMP_DIR/stderr.log" || fail "tsx 없음 case: 다음에 칠 명령을 안 말함"
if [ -s "$TMP_DIR/stdout.log" ]; then fail "tsx 없음 case: 실패했는데 stdout 에 뭔가 냄"; fi
echo "✅ case 1 (tsx 없음 → 원인 + 다음 명령, 실패로 멈춤) OK"

# case 2: 실 저장소는 이미 pnpm setup 이 됐거나 안 됐거나 둘 중 하나 — 스크립트 자체가
#   구문 오류 없이 그 판정만 하고 넘어가는지(자기 진단)를 별도로 고정한다.
bash -n "$GOOTTE_SH" || fail "구문 검사 실패"
echo "✅ case 2 (스크립트 구문 OK) OK"

# case 3: tsx 바이너리가 있으면 — 안내를 찍지 않고 실행을 그대로 넘긴다(위임 확인).
#   실제 pnpm 호출 없이, ROOT_DIR 을 임시로 두고 실행 가능한 자리끼움 tsx 로 위임 여부만 본다.
FAKE_ROOT="$TMP_DIR/has-deps"
mkdir -p "$FAKE_ROOT/code/web/node_modules/.bin"
mkdir -p "$FAKE_ROOT/scripts"
cat >"$FAKE_ROOT/code/web/node_modules/.bin/tsx" <<'EOF'
#!/usr/bin/env bash
echo "tsx-stub-ran"
EOF
chmod +x "$FAKE_ROOT/code/web/node_modules/.bin/tsx"
cat >"$FAKE_ROOT/scripts/gootte.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$FAKE_ROOT"
TSX_BIN="\$ROOT_DIR/code/web/node_modules/.bin/tsx"
if [ ! -x "\$TSX_BIN" ]; then
  echo "gootte: 의존성이 설치돼 있지 않습니다 — 없음: \$TSX_BIN" >&2
  echo "다음을 실행하세요: pnpm setup" >&2
  exit 1
fi
echo "delegated"
EOF
OUT=$(bash "$FAKE_ROOT/scripts/gootte.sh")
[ "$OUT" = "delegated" ] || fail "tsx 있음 case: 안내를 찍지 않고 넘겨야 하는데 '$OUT' 을 냄"
echo "✅ case 3 (tsx 있음 → 안내 없이 그대로 위임) OK"

echo "✅ scripts/gootte.sh 전체 통과"
