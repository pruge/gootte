#!/usr/bin/env bash
# scripts/lib/allocate-worktree-ports.sh — 격리 작업 사본의 dev 포트 **배정기**(읽는 쪽이 아니다).
#
# 🔴 왜 있나 — 배정과 판정은 다른 물건이다.
#   · 판정: scripts/ports.sh 가 `.ports.worktree > .ports.main` 순서로 읽는다(유일한 판정자).
#   · 배정: 그 파일을 **누가 쓰는지**가 longbridge 없으면 격리 사본은 아무 값도 못 갖는다.
#     값이 없으면 ports.sh 는 .ports.main 으로 갈리고, 격리 사본은 캡틴이 켠 서버와 같은 포트를
#     집어 삼킨다(AGENTS.md 제품 규칙이 금지한 사고 — "두 사본이 같은 포트를 쥔 채 아무도 모른다").
#   이 파일이 그 빈 주체를 메운다 — bin/worker(spawn) 가 포트 락 안에서 호출하는 것이 실사용 경로다.
#
# 공식(은 `bin/worker` 가 써 오던 gootte 규약 그 자체 — 숫자의 SoT 는 여기다):
#   BACKEND_PORT  = 8802 + 10n
#   FRONTEND_PORT = 5302 + 4n     (**항상 짝수** — STUDIO_PORT = FRONTEND+1 규약)
#   n = 1..60 중 **아무도 안 쓰는** 첫 슬롯. "안 쓴다" = ① 다른 .ports.* 가 이미 적었고
#   ② 지금 그 포트를 듣고 있는 프로세스가 없다(Studio+1 슬롯까지 같이 본다).
#
# 순수 함수만 둔다(파일을 쓰지 않는다) — 쓰는 쪽에서 자기 경로에 적는다.
# 테스트: scripts/tests/allocate-worktree-ports.test.sh (임시 fixture, 실 저장소 파일 안 건드림)

# 포트가 지금 사용 중인가. bash 내장 /dev/tcp 만 쓴다(lsof·nc 의존 없음).
# 테스트에서 갈아끼울 수 있도록 함수로 분리한다.
port_is_busy() {
  local port="$1"
  (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null && { exec 3<&- 3>&-; return 0; }
  return 1
}

# 이미 배정된 포트 목록을 모은다.
#   $@ = 뒤질 디렉터리들(각각의 code/web/.ports.main · .ports.worktree 를 읽는다)
# stdout = 한 줄에 포트 하나.
ports_claimed() {
  local dir f
  for dir in "$@"; do
    for f in "$dir/code/web/.ports.main" "$dir/code/web/.ports.worktree"; do
      [ -f "$f" ] || continue
      # 🔴 tr -d '[:space:]' 를 쓰면 개행까지 지워져 "88025302" 한 덩어리가 된다.
      #    [:blank:](스페이스·탭)와 CR 만 턴다 — 한 줄에 포트 하나라는 계약을 지킨다.
      grep -E '^(BACKEND_PORT|FRONTEND_PORT)=' "$f" | cut -d= -f2- | tr -d '\r[:blank:]'
    done
  done
}

# 빈 슬롯 하나를 고른다.
#   $1 = 이미 배정된 포트 목록(개행 구분, 비어도 됨)
# stdout = "BACKEND_PORT=..\nFRONTEND_PORT=.." 두 줄. 실패 시 비어 있고 상태 1.
allocate_worktree_ports() {
  local claimed="${1:-}"
  local n be fe
  for n in $(seq 1 60); do
    be=$((8802 + 10 * n))
    fe=$((5302 + 4 * n))
    # 스튜디오 몫(fe+1)까지 셋을 통째로 본다 — 하나라도 겹치면(배정 기록이든 실제 리스너든) 다음 슬롯.
    if printf '%s\n' "$claimed" | grep -qxE "$fe|$((fe + 1))|$be"; then continue; fi
    if port_is_busy "$be" || port_is_busy "$fe" || port_is_busy $((fe + 1)); then continue; fi
    printf 'BACKEND_PORT=%s\nFRONTEND_PORT=%s\n' "$be" "$fe"
    return 0
  done
  echo "❌ allocate-worktree-ports: 8812~9402 / 5306~5542 에 빈 슬롯이 없다" >&2
  return 1
}
