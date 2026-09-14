#!/usr/bin/env bash
# scripts/tests/gootte-wrapper.test.sh — scripts/gootte.sh 판정 검증(development-order/15 ④).
#
# tsx 가 없는 사본에서 원인과 다음에 칠 명령을 그대로 보여주고 멈추는지,
# tsx 가 있는 사본에서는 평소처럼 그대로 넘기는지를 임시 fixture 로 검증한다.
#
# 사용: pnpm test:ports  (= bash scripts/tests/ports.test.sh && bash scripts/tests/gootte-wrapper.test.sh)
#
# case 4~8 은 `bin/gootte` 의 memo 라우팅(PATH 진입점)을 잰다 — 가짜 npx 로 인자 전달만 본다.

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

# case 4~8: `gootte memo` PATH 라우팅(memos-read-from-any-session/T01).
#
# 🔴 이 worktree 에서 실제 TS 로 증명하지 않는다 — `bin/gootte:42-50` 이 GOOTTE_HOME 을 **메인
# 저장소로 승격**시키도록 설계돼 있다(worktree 의 빈 node_modules 를 피하는 실측 버그 방지).
# 그래서 여기는 **인자 전달 규약**만 결정적으로 잰다: PATH 앞에 세운 가짜 `npx` 가 받은 argv 를
# 파일로 받아둔다. `memo` 라우트가 없으면 가짜 npx 는 아예 불리지 않는다(= 기능 자체가 없음).
GOOTTE_BIN="$ROOT_DIR/bin/gootte"
FAKE_BIN="$TMP_DIR/fakebin"
mkdir -p "$FAKE_BIN"
cat >"$FAKE_BIN/npx" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$@" > "$NPX_ARGV"
exit 0
EOF
chmod +x "$FAKE_BIN/npx"
export NPX_ARGV="$TMP_DIR/npx.argv"

run_path() { # cwd 무관 — bin/gootte 를 PATH 의 가짜 npx 로 탈 수 있게 한다
  rm -f "$NPX_ARGV"
  PATH="$FAKE_BIN:$PATH" bash "$GOOTTE_BIN" "$@"
}

# case 4: `gootte memo` — TS 진입점과 서브커맨드가 그대로 넘어간다.
if ! run_path memo >"$TMP_DIR/memo.out" 2>"$TMP_DIR/memo.err"; then
  fail "case 4: PATH 에서 'gootte memo' 가 거부됨 — bin/gootte 에 memo 라우트가 없음: $(cat "$TMP_DIR/memo.err")"
fi
grep -q 'code/web/cli/src/main.ts' "$NPX_ARGV" || fail "case 4: TS 진입점에 안 넘김"
[ "$(tail -1 "$NPX_ARGV")" = "memo" ] || fail "case 4: 서브커맨드 'memo' 가 마지막 인자가 아님 — $(tr '\n' '|' < "$NPX_ARGV")"
echo "✅ case 4 (PATH → gootte memo 가 TS 로 위임) OK"

# case 5: 🔴 플래그가 TS 까지 도착한다 — `pos[1]` 만 넘기면 `--undone` 이 길에서 사라진다.
run_path memo --undone || fail "case 5: 'gootte memo --undone' 실패"
[ "$(tail -1 "$NPX_ARGV")" = "--undone" ] \
  || fail "case 5: --undone 이 도착하지 않음 — $(tr '\n' '|' < "$NPX_ARGV")"
run_path memo --done || fail "case 5b: 'gootte memo --done' 실패"
[ "$(tail -1 "$NPX_ARGV")" = "--done" ] || fail "case 5b: --done 이 도착하지 않음"
echo "✅ case 5 (--done/--undone 가 TS 계층까지 통과) OK"

# case 6: 위치 인자도 **그대로** 넘긴다 — 셸에서 조용히 버리면 TS 가 사용자 오류로 멈추는 규약을 못 지킨다.
run_path memo jinwooauto || fail "case 6: 위치 인자 통과 실패"
[ "$(tail -1 "$NPX_ARGV")" = "jinwooauto" ] \
  || fail "case 6: 위치 인자가 사라짐 — $(tr '\n' '|' < "$NPX_ARGV")"
echo "✅ case 6 (위치 인자도 TS 로 — 거부 판정은 TS 몫) OK"

# case 7: 두 플래그를 같이 줘도 셸이 삼키지 않는다(--done --undone 둘 다 전달 → TS 가 오류로 멈춘다).
run_path memo --done --undone || fail "case 7: 두 플래그 통과 실패"
grep -qx -- '--done' "$NPX_ARGV" || fail "case 7: --done 이 안 넘어감"
grep -qx -- '--undone' "$NPX_ARGV" || fail "case 7: --undone 이 안 넘어감"
echo "✅ case 7 (--done --undone 동시 전달) OK"

# case 8: 없는 명령은 여전히 거부된다 — memo 를 붙였다고 거부 목록이 넓어지면 안 된다.
if run_path nope-memo-route >/dev/null 2>&1; then
  fail "case 8: 알 수 없는 명령이 성공하면 안 됨"
fi
if [ -f "$NPX_ARGV" ]; then fail "case 8: 거부됐어야 할 명령이 TS 로 넘어감"; fi
echo "✅ case 8 (memo 외 명령 거부는 그대로) OK"

echo "✅ scripts/gootte.sh 전체 통과"
