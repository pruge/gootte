import { allTickets } from "@gootte/core";
import type { Feature } from "@gootte/contract";

/**
 * 남은(open) 티켓 수 — 완료·폐기 제외. 두 관례(구 `issues/` · 신 `tickets/`)를 합쳐 센다.
 *
 * 🔴 셈법은 **한 곳**이다 — steps 탭의 위 칸(작업 대상, `ProcessView`)과 아래 칸(대기,
 * `WaitingList`)이 같은 배지를 그리는데, T01 이 그 함수를 두 파일에 똑같이 복사해 뒀다.
 * 둘이 갈라지면 같은 화면의 두 목록이 서로 다른 수를 말한다.
 *
 * 판정이 아니라 셈이다(INV-4) — 서버가 이미 보낸 티켓 상태를 세기만 하고 다시 재지 않는다.
 */
export function openCount(f: Feature): number {
  return allTickets(f).filter((t) => t.status !== "done" && t.status !== "dropped").length;
}
