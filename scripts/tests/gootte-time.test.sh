#!/usr/bin/env bash
# scripts/tests/gootte-time.test.sh — bin/gootte 시간 기록 위임 검증(구관례 완전 정리 뒤).
#
# bin/gootte 는 얇은 런처다: 시간 동사 7개를 `time` 하위 명령으로 번역해 dist 번들에
# 넘길 뿐, 티켓 문서를 절대 건드리지 않는다. 이 시험은 실물 번들(node, tsx 불필요)로
# 임시 fixture 에 start/end/pause/resume/reset/cancel/drop 을 걸어 레코드(state.json)
# 단언 + 티켓 파일 바이트 동일을 잰다.
#
# 사용: pnpm test:ports
#   (= bash scripts/tests/ports.test.sh && bash scripts/tests/gootte-wrapper.test.sh
#      && bash scripts/tests/gootte-time.test.sh && ...)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GOOTTE_BIN="$ROOT_DIR/bin/gootte"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

fail() {
  echo "❌ FAIL: $1" >&2
  exit 1
}

# 구문 검사
bash -n "$GOOTTE_BIN" || fail "구문 검사 실패"
echo "✅ case 0 (bash -n 구문 검사) OK"

# 런처는 TS 모노레포 워크스페이스 패키지를 import 하지 않는다(경로로만 위임).
# 도움말 속 패키지명(`pnpm --filter @gootte/cli build`)은 의존이 아니라 안내 문구라 제외한다.
if grep -nE 'from "@gootte|require\("@gootte' "$GOOTTE_BIN" >/dev/null 2>&1; then
  fail "bin/gootte 가 @gootte 워크스페이스 패키지를 참조함"
fi
echo "✅ case 0b (@gootte 무의존) OK"

# 실물 번들로 증명한다 — 없거나 원본보다 낡았으면 여기서 빌드한다(fresh checkout·수정 직후 대비).
if [ ! -f "$ROOT_DIR/code/web/cli/dist/gootte.cjs" ] || [ -n "$(find "$ROOT_DIR/code/web/cli/src" "$ROOT_DIR/code/web/core/src" "$ROOT_DIR/code/web/core-io/src" "$ROOT_DIR/code/web/contract/src" -newer "$ROOT_DIR/code/web/cli/dist/gootte.cjs" -print -quit 2>/dev/null)" ]; then
  echo "ℹ️ dist 번들을 빌드합니다: pnpm --filter @gootte/cli build" >&2
  (cd "$ROOT_DIR/code/web" && pnpm --filter @gootte/cli build) \
    || fail "dist 번들 빌드 실패 — 'pnpm setup' 후 다시 실행"
fi
[ -f "$ROOT_DIR/code/web/cli/dist/gootte.cjs" ] || fail "dist 번들이 없음 — 빌드했는데도 없음"

make_fixture() {
  local dir="$1"
  local feature="$2"
  local ticket_file="$3"
  shift 3
  mkdir -p "$dir/docs/features/$feature/tickets"
  printf '%s\n' "$@" > "$dir/docs/features/$feature/tickets/$ticket_file"
}

# 레코드 한 칸 읽기 — $1=fixture $2=키 $3=칸. 레코드 없으면 MISSING, state 없으면 NOSTATE.
rec_field() {
  node -e 'const fs=require("fs");try{const s=JSON.parse(fs.readFileSync(process.argv[1]+"/.gootte/state.json","utf8"));const r=s.tickets[process.argv[2]];console.log(r===undefined?"MISSING":String(r[process.argv[3]]));}catch(e){console.log("NOSTATE");}' "$1" "$2" "$3"
}

STATE_OF() { cat "$1/.gootte/state.json"; }

# case 1: start — state.json 에 startedAt 기록 + 티켓 바이트 동일
FIXTURE1="$TMP_DIR/case1"
make_fixture "$FIXTURE1" "my-feature" "T01.md" \
  "# T01 — 실물 모양 티켓" \
  "" \
  "Status: in-progress" \
  "" \
  "## Goal" \
  "" \
  "Body text here."
cp "$FIXTURE1/docs/features/my-feature/tickets/T01.md" "$TMP_DIR/case1.before.md"
(cd "$FIXTURE1" && "$GOOTTE_BIN" start my-feature T01) >"$TMP_DIR/case1.out" 2>"$TMP_DIR/case1.err" \
  || fail "case1: start 가 실패함: $(cat "$TMP_DIR/case1.err")"
[ "$(rec_field "$FIXTURE1" "my-feature/T01" startedAt)" != "MISSING" ] || fail "case1: startedAt 기록 없음"
[ "$(rec_field "$FIXTURE1" "my-feature/T01" startedAt)" != "NOSTATE" ] || fail "case1: state.json 없음"
[ "$(rec_field "$FIXTURE1" "my-feature/T01" finishedAt)" = "null" ] || fail "case1: finishedAt 가 null 이 아님"
grep -qE '"startedAt": "[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[+-][0-9]{2}:[0-9]{2}"' "$FIXTURE1/.gootte/state.json" \
  || fail "case1: startedAt 가 ISO 형태가 아님"
cmp -s "$TMP_DIR/case1.before.md" "$FIXTURE1/docs/features/my-feature/tickets/T01.md" \
  || fail "case1: start 가 티켓 문서를 건드림"
echo "✅ case 1 (start → 레코드 startedAt + 티켓 불변) OK"

# case 2: end — finishedAt 기록 + 티켓 불변
(cd "$FIXTURE1" && "$GOOTTE_BIN" end my-feature T01) >"$TMP_DIR/case2.out" 2>"$TMP_DIR/case2.err" \
  || fail "case2: end 가 실패함: $(cat "$TMP_DIR/case2.err")"
[ "$(rec_field "$FIXTURE1" "my-feature/T01" finishedAt)" != "null" ] || fail "case2: finishedAt 기록 없음"
cmp -s "$TMP_DIR/case1.before.md" "$FIXTURE1/docs/features/my-feature/tickets/T01.md" \
  || fail "case2: end 가 티켓 문서를 건드림"
echo "✅ case 2 (end → 레코드 finishedAt + 티켓 불변) OK"

# case 3: 이미 끝난 티켓에 start → 에러, state 불변
BEFORE_CASE3="$(STATE_OF "$FIXTURE1")"
if (cd "$FIXTURE1" && "$GOOTTE_BIN" start my-feature T01) >"$TMP_DIR/case3.out" 2>"$TMP_DIR/case3.err"; then
  fail "case3: 끝난 티켓에 start 가 성공하면 안 됨"
fi
[ -s "$TMP_DIR/case3.err" ] || fail "case3: stderr 에 에러 메시지가 없음"
[ "$BEFORE_CASE3" = "$(STATE_OF "$FIXTURE1")" ] || fail "case3: 실패했는데 state 가 바뀜"
echo "✅ case 3 (끝난 티켓 → start 에러, state 불변) OK"

# case 4: 이미 finished 인 티켓에 end → 에러, state 불변
BEFORE_CASE4="$(STATE_OF "$FIXTURE1")"
if (cd "$FIXTURE1" && "$GOOTTE_BIN" end my-feature T01) >"$TMP_DIR/case4.out" 2>"$TMP_DIR/case4.err"; then
  fail "case4: 이미 finished 인 티켓에 end 가 성공하면 안 됨"
fi
[ -s "$TMP_DIR/case4.err" ] || fail "case4: stderr 에 에러 메시지가 없음"
[ "$BEFORE_CASE4" = "$(STATE_OF "$FIXTURE1")" ] || fail "case4: 실패했는데 state 가 바뀜"
echo "✅ case 4 (이미 finished 인 티켓 → end 에러, state 불변) OK"

# case 5: 시작 안 된 티켓에 end → 에러
FIXTURE5="$TMP_DIR/case5"
make_fixture "$FIXTURE5" "my-feature" "T02.md" \
  "# T02 — 아직 시작 안 함" \
  "" \
  "## Goal" \
  "" \
  "Body."
if (cd "$FIXTURE5" && "$GOOTTE_BIN" end my-feature T02) >"$TMP_DIR/case5.out" 2>"$TMP_DIR/case5.err"; then
  fail "case5: 시작 안 된 티켓에 end 가 성공하면 안 됨"
fi
grep -q '시작되지 않은' "$TMP_DIR/case5.err" || fail "case5: 에러 메시지가 시작 여부를 안 말함: $(cat "$TMP_DIR/case5.err")"
echo "✅ case 5 (시작 안 된 티켓 → end 에러) OK"

# case 6: 없는 기능/티켓 → 에러
if (cd "$FIXTURE5" && "$GOOTTE_BIN" start no-such-feature T01) >"$TMP_DIR/case6a.out" 2>"$TMP_DIR/case6a.err"; then
  fail "case6a: 없는 기능에 start 가 성공하면 안 됨"
fi
[ -s "$TMP_DIR/case6a.err" ] || fail "case6a: stderr 에 에러 메시지가 없음"

if (cd "$FIXTURE5" && "$GOOTTE_BIN" start my-feature T99) >"$TMP_DIR/case6b.out" 2>"$TMP_DIR/case6b.err"; then
  fail "case6b: 없는 티켓에 start 가 성공하면 안 됨"
fi
[ -s "$TMP_DIR/case6b.err" ] || fail "case6b: stderr 에 에러 메시지가 없음"
echo "✅ case 6 (없는 기능/티켓 → 에러) OK"

# case 7: 티켓 인자 "T01" 과 "01" 둘 다 같은 키(T01)로 기록된다
FIXTURE7="$TMP_DIR/case7"
make_fixture "$FIXTURE7" "my-feature" "T03.md" \
  "# T03 — 숫자만 인자로" \
  "" \
  "## Goal" \
  "" \
  "Body."
(cd "$FIXTURE7" && "$GOOTTE_BIN" start my-feature 03) >"$TMP_DIR/case7.out" 2>"$TMP_DIR/case7.err" \
  || fail "case7: 숫자만 인자(03)로 start 가 실패함: $(cat "$TMP_DIR/case7.err")"
[ "$(rec_field "$FIXTURE7" "my-feature/T03" startedAt)" != "MISSING" ] \
  || fail "case7: 숫자 인자가 T03 키로 기록돼야 함"
[ "$(rec_field "$FIXTURE7" "my-feature/03" startedAt)" = "MISSING" ] \
  || fail "case7: 날것 키(my-feature/03)로 기록되면 조인에 안 닿음"
echo "✅ case 7 (티켓 인자 T01/01 → 같은 T번호 키) OK"

# case 8: 구관례(issues/) 티켓 — 번호 인자로 기록, 키는 파일 basename
FIXTURE8="$TMP_DIR/case8"
mkdir -p "$FIXTURE8/docs/features/my-feature/issues"
cat > "$FIXTURE8/docs/features/my-feature/issues/01-x.md" <<'EOF'
# 01 — 구관례 티켓

**Blocked by:** 없음.

## 캡틴 지시 (원문)
EOF
cp "$FIXTURE8/docs/features/my-feature/issues/01-x.md" "$TMP_DIR/case8.before.md"
(cd "$FIXTURE8" && "$GOOTTE_BIN" start my-feature 01) >"$TMP_DIR/case8.out" 2>"$TMP_DIR/case8.err" \
  || fail "case8: 구관례 start 가 실패함: $(cat "$TMP_DIR/case8.err")"
[ "$(rec_field "$FIXTURE8" "my-feature/01-x" startedAt)" != "MISSING" ] \
  || fail "case8: 구관례 키(my-feature/01-x)로 기록돼야 함"
(cd "$FIXTURE8" && "$GOOTTE_BIN" end my-feature 01) >"$TMP_DIR/case8b.out" 2>"$TMP_DIR/case8b.err" \
  || fail "case8: 구관례 end 가 실패함: $(cat "$TMP_DIR/case8b.err")"
[ "$(rec_field "$FIXTURE8" "my-feature/01-x" finishedAt)" != "null" ] || fail "case8: 구관례 finishedAt 기록 없음"
cmp -s "$TMP_DIR/case8.before.md" "$FIXTURE8/docs/features/my-feature/issues/01-x.md" \
  || fail "case8: 구관례 티켓 문서가 바뀜"
echo "✅ case 8 (구관례 issues → basename 키로 기록, 문서 불변) OK"

# case 9: pause → 중복 pause 에러 → pause 중 end 에러 → resume → end
FIXTURE9="$TMP_DIR/case9"
make_fixture "$FIXTURE9" "my-feature" "T04.md" "# T04 — pause/resume" "" "## Goal" "" "Body."
(cd "$FIXTURE9" && "$GOOTTE_BIN" start my-feature T04) >"$TMP_DIR/case9s.out" 2>"$TMP_DIR/case9s.err" \
  || fail "case9: start 실패"
(cd "$FIXTURE9" && "$GOOTTE_BIN" pause my-feature T04) >"$TMP_DIR/case9p.out" 2>"$TMP_DIR/case9p.err" \
  || fail "case9: pause 실패: $(cat "$TMP_DIR/case9p.err")"
node -e 'const s=JSON.parse(require("fs").readFileSync("'"$FIXTURE9"'/.gootte/state.json","utf8"));const p=s.tickets["my-feature/T04"].pauses;if(!(p.length===1&&p[0].resumedAt===null))process.exit(1);' \
  || fail "case9: 열린 pause 구간이 하나 있어야 함"
if (cd "$FIXTURE9" && "$GOOTTE_BIN" pause my-feature T04) >"$TMP_DIR/case9p2.out" 2>"$TMP_DIR/case9p2.err"; then
  fail "case9: 일시중단 중 pause 가 성공하면 안 됨"
fi
if (cd "$FIXTURE9" && "$GOOTTE_BIN" end my-feature T04) >"$TMP_DIR/case9e.out" 2>"$TMP_DIR/case9e.err"; then
  fail "case9: 일시중단 중 end 가 성공하면 안 됨"
fi
(cd "$FIXTURE9" && "$GOOTTE_BIN" resume my-feature T04) >"$TMP_DIR/case9r.out" 2>"$TMP_DIR/case9r.err" \
  || fail "case9: resume 실패: $(cat "$TMP_DIR/case9r.err")"
(cd "$FIXTURE9" && "$GOOTTE_BIN" end my-feature T04) >"$TMP_DIR/case9e2.out" 2>"$TMP_DIR/case9e2.err" \
  || fail "case9: resume 후 end 실패: $(cat "$TMP_DIR/case9e2.err")"
node -e 'const s=JSON.parse(require("fs").readFileSync("'"$FIXTURE9"'/.gootte/state.json","utf8"));const r=s.tickets["my-feature/T04"];if(!(r.pauses.length===1&&r.pauses[0].resumedAt!==null&&r.finishedAt!==null))process.exit(1);' \
  || fail "case9: pause+resume 쌍 완성 + finishedAt 이어야 함"
echo "✅ case 9 (pause → 중복pause 에러 → end 에러 → resume → end) OK"

# case 10: --at 상대 시간(2h) — 지금으로부터 약 2시간 전 기록
FIXTURE10="$TMP_DIR/case10"
make_fixture "$FIXTURE10" "my-feature" "T05.md" \
  "# T05 — --at 테스트" "" "## Goal" "" "Body."
(cd "$FIXTURE10" && "$GOOTTE_BIN" start my-feature T05 --at 2h) >"$TMP_DIR/case10.out" 2>"$TMP_DIR/case10.err" \
  || fail "case10: --at 2h start 실패: $(cat "$TMP_DIR/case10.err")"
DIFF="$(node -e 'const s=JSON.parse(require("fs").readFileSync("'"$FIXTURE10"'/.gootte/state.json","utf8"));console.log(Math.round((Date.now()-Date.parse(s.tickets["my-feature/T05"].startedAt))/1000));')"
[ "$DIFF" -ge 7000 ] && [ "$DIFF" -le 7400 ] || fail "case10: --at 2h 차이가 기대 범위 밖: $DIFF 초"
echo "✅ case 10 (--at 2h → 약 2시간 전 기록) OK"

# case 11: --at 명시 ISO & --at= 형태 & 잘못된 값
FIXTURE11="$TMP_DIR/case11"
make_fixture "$FIXTURE11" "my-feature" "T06.md" \
  "# T06 — --at ISO" "" "## Goal" "" "Body."
(cd "$FIXTURE11" && "$GOOTTE_BIN" start my-feature T06 --at 2026-08-29T15:00:00+09:00) >"$TMP_DIR/case11.out" 2>"$TMP_DIR/case11.err" \
  || fail "case11: --at ISO 실패: $(cat "$TMP_DIR/case11.err")"
[ "$(rec_field "$FIXTURE11" "my-feature/T06" startedAt)" = "2026-08-29T15:00:00+09:00" ] \
  || fail "case11: 명시 ISO 가 그대로 기록돼야 함"
FIXTURE11B="$TMP_DIR/case11b"
make_fixture "$FIXTURE11B" "my-feature" "T07.md" "# T07 — --at= 형태" "" "## Goal" "" "Body."
(cd "$FIXTURE11B" && "$GOOTTE_BIN" start my-feature T07 --at=90m) >"$TMP_DIR/case11b.out" 2>"$TMP_DIR/case11b.err" \
  || fail "case11b: --at=90m 실패: $(cat "$TMP_DIR/case11b.err")"
[ "$(rec_field "$FIXTURE11B" "my-feature/T07" startedAt)" != "MISSING" ] || fail "case11b: --at= 형태 미작동"
if (cd "$FIXTURE11B" && "$GOOTTE_BIN" start my-feature T07 --at abc) >"$TMP_DIR/case11c.out" 2>"$TMP_DIR/case11c.err"; then
  fail "case11c: 잘못된 --at 값이 에러여야 함"
fi
[ -s "$TMP_DIR/case11c.err" ] || fail "case11c: stderr 에 에러 메시지가 없음"
echo "✅ case 11 (--at 명시 ISO / --at= 형태 / 잘못된 값 에러) OK"

# case 12: reset — 레코드 삭제(처음 상태로 되돌림). cancel 은 별칭
FIXTURE12="$TMP_DIR/case12"
make_fixture "$FIXTURE12" "my-feature" "T08.md" "# T08 — reset" "" "## Goal" "" "Body."
cp "$FIXTURE12/docs/features/my-feature/tickets/T08.md" "$TMP_DIR/case12.before.md"
(cd "$FIXTURE12" && "$GOOTTE_BIN" start my-feature T08) >"$TMP_DIR/case12s.out" 2>"$TMP_DIR/case12s.err" \
  || fail "case12: start 실패: $(cat "$TMP_DIR/case12s.err")"
[ "$(rec_field "$FIXTURE12" "my-feature/T08" startedAt)" != "MISSING" ] || fail "case12: start 로 레코드가 안 생김"
(cd "$FIXTURE12" && "$GOOTTE_BIN" reset my-feature T08) >"$TMP_DIR/case12.out" 2>"$TMP_DIR/case12.err" \
  || fail "case12: reset 실패: $(cat "$TMP_DIR/case12.err")"
[ "$(rec_field "$FIXTURE12" "my-feature/T08" startedAt)" = "MISSING" ] || fail "case12: reset 후 레코드가 남아 있음"
cmp -s "$TMP_DIR/case12.before.md" "$FIXTURE12/docs/features/my-feature/tickets/T08.md" \
  || fail "case12: reset 이 문서를 건드림"
(cd "$FIXTURE12" && "$GOOTTE_BIN" start my-feature T08) >/dev/null 2>&1 || fail "case12: reset 후 재 start 실패"
(cd "$FIXTURE12" && "$GOOTTE_BIN" cancel my-feature T08) >"$TMP_DIR/case12b.out" 2>"$TMP_DIR/case12b.err" \
  || fail "case12: cancel(별칭) 실패: $(cat "$TMP_DIR/case12b.err")"
[ "$(rec_field "$FIXTURE12" "my-feature/T08" startedAt)" = "MISSING" ] || fail "case12: cancel 후 레코드가 남아 있음"
echo "✅ case 12 (reset → 레코드 삭제 + 문서 불변, cancel 별칭 동일) OK"

# case 13: 시작 안 된 티켓에 reset/cancel → 에러
FIXTURE13="$TMP_DIR/case13"
make_fixture "$FIXTURE13" "my-feature" "T09.md" "# T09 — reset 전" "" "## Goal" "" "Body."
if (cd "$FIXTURE13" && "$GOOTTE_BIN" reset my-feature T09) >"$TMP_DIR/case13.out" 2>"$TMP_DIR/case13.err"; then
  fail "case13: 시작 안 된 티켓에 reset 이 성공하면 안 됨"
fi
[ -s "$TMP_DIR/case13.err" ] || fail "case13: stderr 에 에러 메시지가 없음"
if (cd "$FIXTURE13" && "$GOOTTE_BIN" cancel my-feature T09) >"$TMP_DIR/case13b.out" 2>"$TMP_DIR/case13b.err"; then
  fail "case13: 시작 안 된 티켓에 cancel(별칭) 이 성공하면 안 됨"
fi
echo "✅ case 13 (시작 안 된 티켓 → reset/cancel 에러) OK"

# case 14: 끝난 티켓에 start --force → 새 시작으로 통째로 교체(finished 제거)
FIXTURE14="$TMP_DIR/case14"
make_fixture "$FIXTURE14" "my-feature" "T10.md" "# T10 — start force" "" "## Goal" "" "Body."
(cd "$FIXTURE14" && "$GOOTTE_BIN" start --at 2026-09-01T09:00:00+09:00 my-feature T10) >/dev/null 2>&1 \
  || fail "case14: start 실패"
(cd "$FIXTURE14" && "$GOOTTE_BIN" end --at 2026-09-01T10:00:00+09:00 my-feature T10) >/dev/null 2>&1 \
  || fail "case14: end 실패"
(cd "$FIXTURE14" && "$GOOTTE_BIN" start --force --at 2026-09-02T10:00:00+09:00 my-feature T10) >"$TMP_DIR/case14.out" 2>"$TMP_DIR/case14.err" \
  || fail "case14: start --force 실패: $(cat "$TMP_DIR/case14.err")"
[ "$(rec_field "$FIXTURE14" "my-feature/T10" startedAt)" = "2026-09-02T10:00:00+09:00" ] \
  || fail "case14: --force 로 startedAt 가 안 바뀜"
[ "$(rec_field "$FIXTURE14" "my-feature/T10" finishedAt)" = "null" ] \
  || fail "case14: --force 후 finishedAt 가 남아 있음"
echo "✅ case 14 (start --force → 끝난 기록 통째로 교체) OK"

# case 15: drop — statusRaw wontfix(날짜). 중복 drop → 에러
FIXTURE15="$TMP_DIR/case15"
make_fixture "$FIXTURE15" "my-feature" "T11.md" "# T11 — drop" "" "## Goal" "" "Body."
cp "$FIXTURE15/docs/features/my-feature/tickets/T11.md" "$TMP_DIR/case15.before.md"
(cd "$FIXTURE15" && "$GOOTTE_BIN" drop my-feature T11) >"$TMP_DIR/case15.out" 2>"$TMP_DIR/case15.err" \
  || fail "case15: drop 실패: $(cat "$TMP_DIR/case15.err")"
rec_field "$FIXTURE15" "my-feature/T11" statusRaw | grep -q '^wontfix (' \
  || fail "case15: statusRaw 가 wontfix(날짜)여야 함"
if (cd "$FIXTURE15" && "$GOOTTE_BIN" drop my-feature T11) >"$TMP_DIR/case15b.out" 2>"$TMP_DIR/case15b.err"; then
  fail "case15: 중복 drop 이 성공하면 안 됨"
fi
cmp -s "$TMP_DIR/case15.before.md" "$FIXTURE15/docs/features/my-feature/tickets/T11.md" \
  || fail "case15: drop 이 문서를 건드림"
echo "✅ case 15 (drop → statusRaw wontfix, 중복 에러, 문서 불변) OK"

# case 16: MD에 레거시 Time: 줄이 남아 있어도 start 는 레코드 경로 + MD 바이트 동일(좀비 면역)
FIXTURE16="$TMP_DIR/case16"
make_fixture "$FIXTURE16" "my-feature" "T12.md" \
  "# T12 — 레거시 줄 잔존" \
  "" \
  "**Time:** started=2026-08-01T09:00:00+09:00" \
  "" \
  "## Goal" \
  "" \
  "Body."
cp "$FIXTURE16/docs/features/my-feature/tickets/T12.md" "$TMP_DIR/case16.before.md"
(cd "$FIXTURE16" && "$GOOTTE_BIN" start my-feature T12) >"$TMP_DIR/case16.out" 2>"$TMP_DIR/case16.err" \
  || fail "case16: start 실패: $(cat "$TMP_DIR/case16.err")"
[ "$(rec_field "$FIXTURE16" "my-feature/T12" startedAt)" != "MISSING" ] || fail "case16: 레코드 기록 없음"
cmp -s "$TMP_DIR/case16.before.md" "$FIXTURE16/docs/features/my-feature/tickets/T12.md" \
  || fail "case16: 레거시 줄이 바뀌었음 — 런처는 문서를 고치지 않는다"
echo "✅ case 16 (레거시 Time: 줄 잔존 → 레코드 기록 + MD 불변) OK"

echo "✅ scripts/tests/gootte-time.test.sh 전체 통과 (레코드 경로·MD 불변·pause/resume·reset/cancel·drop·--at 포함)"
