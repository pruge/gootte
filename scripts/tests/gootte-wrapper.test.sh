#!/usr/bin/env bash
# scripts/tests/gootte-wrapper.test.sh — scripts/gootte.sh 판정 검증(development-order/15 ④).
#
# tsx 가 없는 사본에서 원인과 다음에 칠 명령을 그대로 보여주고 멈추는지,
# tsx 가 있는 사본에서는 평소처럼 그대로 넘기는지를 임시 fixture 로 검증한다.
#
# 사용: pnpm test:ports  (= bash scripts/tests/ports.test.sh && bash scripts/tests/gootte-wrapper.test.sh)
#
# case 4~9 는 `bin/gootte` 의 memo 라우팅(PATH 진입점)을 잰다 — 가짜 npx 로 인자 전달만 본다.

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

# case 4~12: `bin/gootte` 런처 규약(구관례 완전 정리 뒤).
#
# 런처는 문서를 절대 건드리지 않고 TS 에 위임만 한다:
#   1) dist 번들이 있으면 `node dist/gootte.cjs` (npx 불필요 — GUI PATH 에서도 돈다).
#   2) 없으면(dev 체크아웃) `npx tsx src/main.ts` 폴백 — npx 없으면 실패로 죽는다(MD 폴백 없음).
# 시간 동사 7개(start|pause|resume|end|reset|cancel|drop)만 `time` 하위 명령으로 번역하고,
# 나머지는 verbatim 전달(거부 판정은 TS 몫 — 셸에서 삼키면 필터가 조용히 사라진다).
#
# 🔴 이 worktree 에서 실제 TS 로 증명하지 않는다 — `bin/gootte` 가 GOOTTE_HOME 을 **메인
# 저장소로 승격**시키도록 설계돼 있다(worktree 의 빈 node_modules 를 피하는 실측 버그 방지).
# 그래서 여기는 **인자 전달 규약**만 결정적으로 잰다: PATH 앞에 세운 가짜 `node`/`npx` 가
# 받은 argv 를 파일로 받아둔다.
GOOTTE_BIN="$ROOT_DIR/bin/gootte"
# case 4~11 은 dist 번들 경로를 타므로, 없거나 원본보다 낡았으면 여기서 빌드한다.
# 빌드 실패는 그대로 실패(원인 명시) — 조용히 폴백 경로로 시험을 바꾸지 않는다.
if [ ! -f "$ROOT_DIR/code/web/cli/dist/gootte.cjs" ] || [ -n "$(find "$ROOT_DIR/code/web/cli/src" "$ROOT_DIR/code/web/core/src" "$ROOT_DIR/code/web/core-io/src" "$ROOT_DIR/code/web/contract/src" -newer "$ROOT_DIR/code/web/cli/dist/gootte.cjs" -print -quit 2>/dev/null)" ]; then
  echo "ℹ️ dist 번들을 빌드합니다: pnpm --filter @gootte/cli build" >&2
  (cd "$ROOT_DIR/code/web" && pnpm --filter @gootte/cli build) \
    || fail "dist 번드 빌드 실패 — 'pnpm setup' 후 다시 실행"
fi
[ -f "$ROOT_DIR/code/web/cli/dist/gootte.cjs" ] || fail "dist 번들이 없음 — 빌드했는데도 없음"
FAKE_BIN="$TMP_DIR/fakebin"
mkdir -p "$FAKE_BIN"
cat >"$FAKE_BIN/node" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$@" > "$NODE_ARGV"
exit 0
EOF
cat >"$FAKE_BIN/npx" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$@" > "$NPX_ARGV"
exit 0
EOF
chmod +x "$FAKE_BIN/node" "$FAKE_BIN/npx"
export NODE_ARGV="$TMP_DIR/node.argv"
export NPX_ARGV="$TMP_DIR/npx.argv"

run_node() { # dist 경로 — 가짜 node 가 argv 를 받아둔다
  rm -f "$NODE_ARGV"
  PATH="$FAKE_BIN:$PATH" bash "$GOOTTE_BIN" "$@"
}
run_fallback() { # dev 폴백 경로 — GOOTTE_HOME 을 dist 없는 fixture 로 고정하고 가짜 npx 로 받는다
  rm -f "$NPX_ARGV"
  PATH="$FAKE_BIN:$PATH" GOOTTE_HOME="$FALLBACK_HOME" bash "$GOOTTE_BIN" "$@"
}

# npx 없는 PATH (case 10·13) — npx 디렉토리만 뺀다. 가짜 node 는 FAKE_BIN 쪽에 둔다.
NPX_DIR="$(dirname "$(command -v npx)")"
[ -d "$NPX_DIR" ] || fail "npx 위치를 못 찾음 — case 10·13 불가"
NOPATH="$(printf '%s' "$PATH" | tr ':' '\n' | grep -vx "$NPX_DIR" | paste -sd: -)"
FAKE_BIN_NONPX="$TMP_DIR/fakebin-nonpx"
mkdir -p "$FAKE_BIN_NONPX"
cp "$FAKE_BIN/node" "$FAKE_BIN_NONPX/node"

# case 4: `gootte memo` — dist 번들에 그대로 넘어간다.
if ! run_node memo >"$TMP_DIR/memo.out" 2>"$TMP_DIR/memo.err"; then
  fail "case 4: PATH 에서 'gootte memo' 가 거부됨: $(cat "$TMP_DIR/memo.err")"
fi
grep -q 'dist/gootte.cjs' "$NODE_ARGV" || fail "case 4: dist 번들에 안 넘김 — $(tr '\n' '|' < "$NODE_ARGV")"
[ "$(tail -1 "$NODE_ARGV")" = "memo" ] || fail "case 4: 서브커맨드 'memo' 가 마지막 인자가 아님 — $(tr '\n' '|' < "$NODE_ARGV")"
echo "✅ case 4 (PATH → gootte memo 가 dist 번들로 위임) OK"

# case 5: 🔴 플래그가 TS 까지 도착한다 — 셸이 삼키면 필터가 조용히 사라진다.
run_node memo --undone || fail "case 5: 'gootte memo --undone' 실패"
[ "$(tail -1 "$NODE_ARGV")" = "--undone" ] \
  || fail "case 5: --undone 이 도착하지 않음 — $(tr '\n' '|' < "$NODE_ARGV")"
run_node memo --done || fail "case 5b: 'gootte memo --done' 실패"
[ "$(tail -1 "$NODE_ARGV")" = "--done" ] || fail "case 5b: --done 이 도착하지 않음"
echo "✅ case 5 (--done/--undone 가 TS 계층까지 통과) OK"

# case 6: 위치 인자도 **그대로** 넘긴다 — 셸에서 조용히 버리면 TS 가 사용자 오류로 멈추는 규약을 못 지킨다.
run_node memo jinwooauto || fail "case 6: 위치 인자 통과 실패"
[ "$(tail -1 "$NODE_ARGV")" = "jinwooauto" ] \
  || fail "case 6: 위치 인자가 사라짐 — $(tr '\n' '|' < "$NODE_ARGV")"
echo "✅ case 6 (위치 인자도 TS 로 — 거부 판정은 TS 몫) OK"

# case 7: 두 플래그를 같이 줘도 셸이 삼키지 않는다(--done --undone 둘 다 전달 → TS 가 오류로 멈춘다).
run_node memo --done --undone || fail "case 7: 두 플래그 통과 실패"
grep -qx -- '--done' "$NODE_ARGV" || fail "case 7: --done 이 안 넘어감"
grep -qx -- '--undone' "$NODE_ARGV" || fail "case 7: --undone 이 안 넘어감"
echo "✅ case 7 (--done --undone 동시 전달) OK"

# case 8: 셸은 알 수 없는 명령을 거부하지 않는다 — 그대로 TS 에 넘기고 사용법 판정은 TS 몫이다.
# (옛 런처는 여기서 usage 로 죽였는데, 그럼 TS 의 오류 규약을 셸이 가린다.)
run_node nope-memo-route >/dev/null 2>&1 || fail "case 8: 셸이 TS 행 명령을 거부하면 안 됨"
[ "$(tail -1 "$NODE_ARGV")" = "nope-memo-route" ] \
  || fail "case 8: 알 수 없는 명령이 TS 에 안 넘어감 — $(tr '\n' '|' < "$NODE_ARGV")"
echo "✅ case 8 (알 수 없는 명령은 TS 로 통과) OK"

# case 9: `memo migrate` 는 **셸을 지나 TS 까지** 그대로 간다(memos-live-with-the-project/T01).
# 하위 명령은 셸이 해석하지 않는다 — slug·플래그 순서를 셸에서 손대면 TS 의 사용자 오류 규율이
# 무너진다(예: `--purge` 를 셸이 삼키면 원본이 조용히 남는다). 여기는 도착 자체만 잰다.
run_node memo migrate jinwooauto --purge || fail "case 9: 'gootte memo migrate … --purge' 실패"
grep -q 'dist/gootte.cjs' "$NODE_ARGV" || fail "case 9: dist 번들에 안 넘김"
tail -3 "$NODE_ARGV" > "$TMP_DIR/tail3"
[ "$(sed -n 1p "$TMP_DIR/tail3")" = "migrate" ]      || fail "case 9: 하위 명령이 도착하지 않음 — $(tr '\n' '|' < "$NODE_ARGV")"
[ "$(sed -n 2p "$TMP_DIR/tail3")" = "jinwooauto" ]   || fail "case 9: slug 가 도착하지 않음"
[ "$(sed -n 3p "$TMP_DIR/tail3")" = "--purge" ]      || fail "case 9: --purge 가 도착하지 않음"
echo "✅ case 9 (memo migrate 의 slug·--purge 가 TS 계층까지 통과) OK"

# case 10: 시간 동사는 `time` 하위 명령으로 번역된다 — npx 없이도 된다(구조적 수정).
# 옛 결함(2026-09-17): v2 위임이 npx 에 걸려 GUI PATH 에서 MD 로 추락했다.
# 새 런처는 dist + node 라 npx 가 없어도 기록이 간다. MD 는 건드리지 않는다(코드 자체가 없음).
V2FIX="$TMP_DIR/v2proj"
mkdir -p "$V2FIX/docs/features/some-feat/tickets" "$V2FIX/.gootte"
cat >"$V2FIX/docs/features/some-feat/tickets/T01.md" <<'EOF'
# T01 — 위임 확인용 티켓

**Blocked by:** 없음 — 즉시 착수 가능

## Goal

위임만 본다.
EOF
printf '{"version":2,"updatedAt":"2026-09-17T00:00:00.000Z","openFeatures":[],"tickets":{}}' >"$V2FIX/.gootte/state.json"
cp "$V2FIX/docs/features/some-feat/tickets/T01.md" "$TMP_DIR/t01.before.md"
bash -n "$GOOTTE_BIN" || fail "case 10: bin/gootte 구문 오류"
! grep -q "cmd_start\|drop_file\|TIME_RE" "$GOOTTE_BIN" || fail "case 10: MD 핸들러 잔존 — 런처에 문서 쓰기 코드가 있으면 안 됨"

# PATH에서 npx 디렉토리를 뺀다 — 그래도 성공해야 한다.
(cd "$V2FIX" && PATH="$FAKE_BIN:$NOPATH" bash "$GOOTTE_BIN" start some-feat T01 >"$TMP_DIR/v2.out" 2>"$TMP_DIR/v2.err") \
  || fail "case 10: dist + node 가 있는데 실패함 — $(cat "$TMP_DIR/v2.err")"
tail -4 "$NODE_ARGV" > "$TMP_DIR/v2tail4"
[ "$(sed -n 1p "$TMP_DIR/v2tail4")" = "time" ]       || fail "case 10: time 번역 미도착 — $(tr '\n' '|' < "$NODE_ARGV")"
[ "$(sed -n 2p "$TMP_DIR/v2tail4")" = "start" ]      || fail "case 10: 서브커맨드 미도착"
[ "$(sed -n 3p "$TMP_DIR/v2tail4")" = "some-feat" ]  || fail "case 10: 기능 미도착"
[ "$(sed -n 4p "$TMP_DIR/v2tail4")" = "T01" ]        || fail "case 10: 티켓 미도착"
cmp -s "$TMP_DIR/t01.before.md" "$V2FIX/docs/features/some-feat/tickets/T01.md" \
  || fail "case 10: 위임했는데 셸이 MD를 건드림"
echo "✅ case 10 (npx 없이 start → dist 위임 time start, MD 불변) OK"

# case 11: --at/--force 는 위치인자 뒤로 붙어 TS 에 닿는다(옛 bash 파서와 같은 규약).
(cd "$V2FIX" && run_node start --at 1h --force some-feat T01) || fail "case 11: 플래그 번역 실패"
tail -3 "$NODE_ARGV" > "$TMP_DIR/v2tail3b"
[ "$(sed -n 1p "$TMP_DIR/v2tail3b")" = "--at" ]     || fail "case 11: --at 미도착 — $(tr '\n' '|' < "$NODE_ARGV")"
[ "$(sed -n 2p "$TMP_DIR/v2tail3b")" = "1h" ]       || fail "case 11: --at 값 미도착"
[ "$(sed -n 3p "$TMP_DIR/v2tail3b")" = "--force" ]  || fail "case 11: --force 미도착"
echo "✅ case 11 (--at/--force 가 TS 규약 위치로 번역) OK"

# case 12~13: dev 폴백 — dist 없는 체크아웃에서는 npx tsx 로 간다.
FALLBACK_HOME="$TMP_DIR/no-dist-home"
mkdir -p "$FALLBACK_HOME/code/web/cli/src"
touch "$FALLBACK_HOME/code/web/cli/src/main.ts"

# case 12: npx 있으면 폴백 위임한다.
run_fallback start some-feat T01 || fail "case 12: 폴백 위임 실패"
grep -q 'code/web/cli/src/main.ts' "$NPX_ARGV" || fail "case 12: TS 진입점에 안 넘김 — $(tr '\n' '|' < "$NPX_ARGV")"
tail -3 "$NPX_ARGV" > "$TMP_DIR/fbtail3"
[ "$(sed -n 1p "$TMP_DIR/fbtail3")" = "start" ]      || fail "case 12: 서브커맨드 미도착"
[ "$(sed -n 2p "$TMP_DIR/fbtail3")" = "some-feat" ]  || fail "case 12: 기능 미도착"
[ "$(sed -n 3p "$TMP_DIR/fbtail3")" = "T01" ]        || fail "case 12: 티켓 미도착"
echo "✅ case 12 (dist 없음 + npx 존재 → tsx 폴백 위임) OK"

# case 13: dist 도 npx 도 없으면 실패로 죽는다(MD 폴백은 없다).
if (PATH="$FAKE_BIN_NONPX:$NOPATH" GOOTTE_HOME="$FALLBACK_HOME" bash "$GOOTTE_BIN" start some-feat T01 >"$TMP_DIR/fb.out" 2>"$TMP_DIR/fb.err"); then
  fail "case 13: dist + npx 부재가 성공하면 안 됨 (MD 폴백 금지)"
fi
grep -q 'npx' "$TMP_DIR/fb.err" || fail "case 13: 실패 원인(npx 부재)을 안 말함 — $(cat "$TMP_DIR/fb.err")"
grep -qiE 'MD|기록하지 않고' "$TMP_DIR/fb.err" || fail "case 13: MD 미기록 약속을 안 말함 — $(cat "$TMP_DIR/fb.err")"
cmp -s "$TMP_DIR/t01.before.md" "$V2FIX/docs/features/some-feat/tickets/T01.md" \
  || fail "case 13: 실패했는데 티켓 파일이 바뀌었음"
echo "✅ case 13 (dist + npx 부재 → 실패로 죽고 MD 불변) OK"

echo "✅ scripts/gootte.sh 전체 통과"
