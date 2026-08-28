#!/usr/bin/env bash
# scripts/tests/gootte-time.test.sh — bin/gootte start/end 판정 검증(ticket-time-stamp/T01).
#
# bin/gootte 는 gootte TS 모노레포를 전혀 참조하지 않는 독립 bash 스크립트다. 이 시험은
# 임시 디렉터리에 실물 티켓 모양의 fixture 를 만들어 start/end 의 삽입·갱신·중복 방지·
# 에러 처리를 grep/diff 로 단언한다.
#
# 사용: pnpm test:ports
#   (= bash scripts/tests/ports.test.sh && bash scripts/tests/gootte-wrapper.test.sh
#      && bash scripts/tests/gootte-time.test.sh)

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

# gootte TS 모노레포 워크스페이스 패키지 무의존
if grep -n '@gootte' "$GOOTTE_BIN" >/dev/null 2>&1; then
  fail "bin/gootte 가 @gootte 워크스페이스 패키지를 참조함"
fi
echo "✅ case 0b (@gootte 무의존) OK"

make_fixture() {
  local dir="$1"
  local feature="$2"
  local ticket_file="$3"
  shift 3
  mkdir -p "$dir/docs/features/$feature/tickets"
  printf '%s\n' "$@" > "$dir/docs/features/$feature/tickets/$ticket_file"
}

# case 1: start — 제목 뒤(본문 앞)에 Time: started=<ISO> 삽입
FIXTURE1="$TMP_DIR/case1"
make_fixture "$FIXTURE1" "my-feature" "T01.md" \
  "# T01 — 실물 모양 티켓" \
  "" \
  "Status: in-progress" \
  "" \
  "## Goal" \
  "" \
  "Body text here."

(cd "$FIXTURE1" && "$GOOTTE_BIN" start my-feature T01) >"$TMP_DIR/case1.out" 2>"$TMP_DIR/case1.err" \
  || fail "case1: start 가 실패함: $(cat "$TMP_DIR/case1.err")"

TICKET1="$FIXTURE1/docs/features/my-feature/tickets/T01.md"
grep -qE '^Time: started=[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[+-][0-9]{2}:[0-9]{2}$' "$TICKET1" \
  || fail "case1: Time: started=<ISO> 줄이 없음"
grep -n '^Status: in-progress$' "$TICKET1" >/dev/null || fail "case1: Status: 줄이 사라짐"
TIME_LINE_NO="$(grep -n '^Time:' "$TICKET1" | head -1 | cut -d: -f1)"
STATUS_LINE_NO="$(grep -n '^Status:' "$TICKET1" | head -1 | cut -d: -f1)"
[ "$TIME_LINE_NO" -eq $((STATUS_LINE_NO + 1)) ] || fail "case1: Time: 줄이 Status: 블록 바로 뒤가 아님"
echo "✅ case 1 (start → Time: started=<ISO> 삽입, Status: 블록 뒤) OK"

# case 2: end — 같은 줄에 finished=<ISO> 추가
(cd "$FIXTURE1" && "$GOOTTE_BIN" end my-feature T01) >"$TMP_DIR/case2.out" 2>"$TMP_DIR/case2.err" \
  || fail "case2: end 가 실패함: $(cat "$TMP_DIR/case2.err")"
grep -qE '^Time: started=\S+ finished=\S+$' "$TICKET1" || fail "case2: finished= 가 같은 줄에 안 붙음"
echo "✅ case 2 (end → 같은 줄에 finished=<ISO> 추가) OK"

# case 3: 이미 시작된 티켓에 start → 에러, exit 0 아님, 파일 안 바뀜
BEFORE_CASE3="$(cat "$TICKET1")"
if (cd "$FIXTURE1" && "$GOOTTE_BIN" start my-feature T01) >"$TMP_DIR/case3.out" 2>"$TMP_DIR/case3.err"; then
  fail "case3: 이미 시작+끝난 티켓에 start 가 성공하면 안 됨"
fi
[ -s "$TMP_DIR/case3.err" ] || fail "case3: stderr 에 에러 메시지가 없음"
AFTER_CASE3="$(cat "$TICKET1")"
[ "$BEFORE_CASE3" = "$AFTER_CASE3" ] || fail "case3: 실패했는데 파일이 바뀜"
echo "✅ case 3 (이미 시작된 티켓 → start 에러, 파일 불변) OK"

# case 4: 이미 finished 인 티켓에 end → 에러, 파일 안 바뀜
BEFORE_CASE4="$(cat "$TICKET1")"
if (cd "$FIXTURE1" && "$GOOTTE_BIN" end my-feature T01) >"$TMP_DIR/case4.out" 2>"$TMP_DIR/case4.err"; then
  fail "case4: 이미 finished 인 티켓에 end 가 성공하면 안 됨"
fi
[ -s "$TMP_DIR/case4.err" ] || fail "case4: stderr 에 에러 메시지가 없음"
AFTER_CASE4="$(cat "$TICKET1")"
[ "$BEFORE_CASE4" = "$AFTER_CASE4" ] || fail "case4: 실패했는데 파일이 바뀜"
echo "✅ case 4 (이미 finished 인 티켓 → end 에러, 파일 불변) OK"

# case 5: 시작 안 된 티켓에 end → 에러, 파일 안 바뀜
FIXTURE5="$TMP_DIR/case5"
make_fixture "$FIXTURE5" "my-feature" "T02.md" \
  "# T02 — 아직 시작 안 함" \
  "" \
  "## Goal" \
  "" \
  "Body."
TICKET5="$FIXTURE5/docs/features/my-feature/tickets/T02.md"
BEFORE_CASE5="$(cat "$TICKET5")"
if (cd "$FIXTURE5" && "$GOOTTE_BIN" end my-feature T02) >"$TMP_DIR/case5.out" 2>"$TMP_DIR/case5.err"; then
  fail "case5: 시작 안 된 티켓에 end 가 성공하면 안 됨"
fi
[ -s "$TMP_DIR/case5.err" ] || fail "case5: stderr 에 에러 메시지가 없음"
AFTER_CASE5="$(cat "$TICKET5")"
[ "$BEFORE_CASE5" = "$AFTER_CASE5" ] || fail "case5: 실패했는데 파일이 바뀜"
echo "✅ case 5 (시작 안 된 티켓 → end 에러, 파일 불변) OK"

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

# case 7: 티켓 인자 "T01" 과 "01" 둘 다 지원
FIXTURE7="$TMP_DIR/case7"
make_fixture "$FIXTURE7" "my-feature" "T03.md" \
  "# T03 — 숫자만 인자로" \
  "" \
  "## Goal" \
  "" \
  "Body."
(cd "$FIXTURE7" && "$GOOTTE_BIN" start my-feature 03) >"$TMP_DIR/case7.out" 2>"$TMP_DIR/case7.err" \
  || fail "case7: 숫자만 인자(03)로 start 가 실패함: $(cat "$TMP_DIR/case7.err")"
grep -qE '^Time: started=' "$FIXTURE7/docs/features/my-feature/tickets/T03.md" \
  || fail "case7: 숫자만 인자로도 Time: 줄이 삽입돼야 함"
echo "✅ case 7 (티켓 인자 T01/01 둘 다 지원) OK"

# case 8: 제목만 있고 Status: 블록이 없는 티켓 — 제목 바로 뒤에 삽입
FIXTURE8="$TMP_DIR/case8"
make_fixture "$FIXTURE8" "my-feature" "T04.md" \
  "# T04 — Status 없음" \
  "" \
  "## Goal" \
  "" \
  "Body."
(cd "$FIXTURE8" && "$GOOTTE_BIN" start my-feature T04) >"$TMP_DIR/case8.out" 2>"$TMP_DIR/case8.err" \
  || fail "case8: start 가 실패함: $(cat "$TMP_DIR/case8.err")"
TICKET8="$FIXTURE8/docs/features/my-feature/tickets/T04.md"
[ "$(sed -n '2p' "$TICKET8")" = "$(grep '^Time:' "$TICKET8")" ] \
  || fail "case8: Status: 없는 티켓은 제목 바로 다음 줄에 Time: 이 와야 함"
echo "✅ case 8 (Status: 없는 티켓 → 제목 바로 뒤에 삽입) OK"

echo "✅ scripts/tests/gootte-time.test.sh 전체 통과"
