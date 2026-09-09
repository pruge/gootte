#!/usr/bin/env bash
# T04 — sync_main_state 훅: 전 명령 확장(B1) + 티켓 기준 원문 판정(B2) 실측.
# 🔴 훅이 읽는 데이터는 **메인의 MD**다 — worktree 기록이 메인에 병합된 뒤의 판정을 잰다.
set -euo pipefail
GROOT="${GROOT:?GROOT=저장소 루트로 실행}"

TMP="$(mktemp -d /tmp/gootte-t04.XXXXXX)"
MAIN="$TMP/main"
WT="$TMP/wt"
trap 'rm -rf "$TMP"' EXIT

# 메인 프로젝트 — alpha(신관례 T01 진행 중·T02 미시작) + beta(구관례 01 resolved·02 ready)
mkdir -p "$MAIN/docs/features/alpha/tickets" "$MAIN/docs/features/beta/issues"
echo agent > "$MAIN/AGENTS.md"
printf '# T01 — 작업 중\n\n**Time:** started=2026-09-09T09:00:00+09:00\n' > "$MAIN/docs/features/alpha/tickets/T01.md"
printf '# T02 — 아직 안 함\n' > "$MAIN/docs/features/alpha/tickets/T02.md"
printf '# 01 — 끝난 티켓\n\n**Status:** resolved (2026-09-01)\n' > "$MAIN/docs/features/beta/issues/01-a.md"
printf '# 02 — 남은 티켓\n\n**Status:** ready-for-agent\n' > "$MAIN/docs/features/beta/issues/02-b.md"

# worktree 흉내 — .git 이 파일인 복사본 + config.json(mainProject)
cp -R "$MAIN/." "$WT/"
echo "gitdir: $MAIN/.git/worktrees/x" > "$WT/.git"
mkdir -p "$WT/.gootte"
printf '{"mainProject": "%s"}\n' "$MAIN" > "$WT/.gootte/config.json"

count() { python3 -c "import json; print(len(json.load(open('$MAIN/.gootte/state.json'))['openFeatures']))"; }

# B1 — worktree에서 end → 메인 state.json 생성·갱신
(cd "$WT" && "$GROOT/bin/gootte" end alpha T01) > /dev/null
first="$(count)"
echo "end 뒤 openFeatures=$first (alpha T02 + beta 02 = 2)"
[ "$first" = "2" ] || { echo "FAIL: end 뒤 배지가 기대와 다르다"; exit 1; }

# B2 — 메인의 beta/02 가 완료로 병합됐다(cmd_end 가 남기는 최종 상태: Status: resolved + finished).
# 예전 python 은 사상 값(done/dropped)을 찾았으므로 이 티켓을 항상 open 으로 셌다.
printf '# 02 — 남은 티켓\n\n**Status:** resolved (2026-09-01)\n\n**Time:** started=2026-09-01T09:00:00+09:00 finished=2026-09-01T10:00:00+09:00\n' > "$MAIN/docs/features/beta/issues/02-b.md"
(cd "$WT" && "$GROOT/bin/gootte" pause alpha T01) > /dev/null
second="$(count)"
echo "beta 병합 뒤 openFeatures=$second (alpha 1만 — resolved/finished 원문 판정)"
[ "$second" = "1" ] || { echo "FAIL: 원문 어휘(resolved) 판정이 틀렸다"; exit 1; }

# B1 보충 — cancel 도 훅이 발동한다(갱신 시각이 바뀐다). 대상은 미완 티켓 alpha/T02.
(cd "$WT" && "$GROOT/bin/gootte" start alpha T02) > /dev/null
u1="$(python3 -c "import json; print(json.load(open('$MAIN/.gootte/state.json'))['updatedAt'])")"
sleep 0.2
(cd "$WT" && "$GROOT/bin/gootte" cancel alpha T02) > /dev/null
u2="$(python3 -c "import json; print(json.load(open('$MAIN/.gootte/state.json'))['updatedAt'])")"
[ "$u1" != "$u2" ] || { echo "FAIL: cancel 뒤 훅이 발동하지 않았다"; exit 1; }
echo "✅ T04 훅 실측 통과 — 전 명령 동기화 + 티켓 기준 원문 판정"
