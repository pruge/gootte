import type { FeatureTicket } from "@gootte/contract";
import { UNRANKED_STEP } from "./move";

/**
 * 의존 목록 → 티켓별 단계 번호(steps-start-from-dependencies/T02).
 *
 * 기능이 **작업 대상에 올라오는 순간** 딱 한 번 쓰인다(D1) — 이후의 순서는 캡틴 손
 * (`placeStep`)과 사관장 손(`step` 명령)이 소유하고, 자동 배정이 다시 덮지 않는다.
 * 배정 규칙은 위상 정렬이다 — 선행이 없으면 1단계, 있으면 모든 선행의 최대 단계 + 1.
 * 서로 독립인 티켓은 자연히 같은 단계를 공유한다(사용자 스토리 2·3).
 *
 * 🔴 **순수 함수다** — 입력은 티켓 목록, 출력은 티켓별 단계 번호. 파일 읽기도 DB 접근도
 * 하지 않는다(`core` 계층 경계). 지능(왜 이 순서인가)은 문서의 `Blocked by:`/`Depends on`
 * 에 이미 캡처돼 있고(read-time 은 계산뿐, INV-4), 없는 순서를 지어내지 않는다(F3).
 *
 * 🔴 **배정할 수 없는 티켓은 `UNRANKED_STEP`(9999) 으로 남는다** — 9999 가 계속 "아직
 * 순서를 안 정했다"의 유일한 표현이다(`plan/move.ts` 주석):
 *
 * - 순환에 걸린 티켓(F3) — 그리고 그것을 기다리는 티켓도. 선행의 단계가 없으면 뒤의
 *   단계도 계산할 수 없다.
 * - 존재하지 않는 번호(또는 번호로 해소되지 않는 산문)를 가리키는 티켓 — 파서가 verbatim
 *   으로 실어 둔 못 알아들은 의존(development-order/17)도 여기서 같은 취급을 받는다.
 *
 * 🔴 **끝난 티켓도 그래프에는 산다** — 되올라온 기능의 `done` 선행 위에 서 있는 남은 티켓은
 * 그 선행 다음 단계를 받아야 한다. 끝난 티켓에서 **행을 빼는 것**(D2)은 심기 자리
 * (`planMove`)의 몫이고, 계산과 심기는 한 자리가 아니다.
 */
export function assignSteps(
  tickets: readonly Pick<FeatureTicket, "slug" | "num" | "blockedBy">[],
): Map<string, number> {
  // 번호 → 슬러그 색인. 번호 비교는 정수로 한다 — 파일명은 "01" 인데 `Blocked by:` 항목이
  // "1" 로 적혀도 같은 선행이다(픽스처의 `doneNums` 와 같은 규율). 산문은 정수로 안 풀린다.
  const slugOfNum = new Map<number, string>();
  for (const t of tickets) {
    const num = Number.parseInt(t.num, 10);
    if (!Number.isNaN(num) && !slugOfNum.has(num)) slugOfNum.set(num, t.slug);
  }

  // 각 티켓의 해소된 선행 목록 + 배정을 막는 결함(존재하지 않는 번호·산문) 표시.
  const depsOf = new Map<string, string[]>();
  const broken = new Set<string>();
  for (const t of tickets) {
    const deps: string[] = [];
    for (const entry of t.blockedBy) {
      const dep = slugOfNum.get(Number.parseInt(entry, 10));
      if (dep === undefined) broken.add(t.slug); // 모르는 대상 — 관계를 지어내지 않는다
      else if (!deps.includes(dep)) deps.push(dep);
    }
    depsOf.set(t.slug, deps);
  }

  // 깊이 우선 위상 배정 — 방문 중에 다시 만나면 순환이다(F3: 거부하고 9999 로 남긴다).
  const VISITING = 1;
  const visiting = new Set<string>();
  const stepOf = new Map<string, number>();

  const visit = (slug: string): number => {
    const memo = stepOf.get(slug);
    if (memo !== undefined) return memo;
    if (visiting.has(slug)) return UNRANKED_STEP; // 순환 — 순서를 지어내지 않는다
    visiting.add(slug);

    let step: number;
    if (broken.has(slug)) {
      step = UNRANKED_STEP;
    } else {
      let max = 0;
      let blocked = false;
      for (const dep of depsOf.get(slug) ?? []) {
        const depStep = visit(dep);
        if (depStep === UNRANKED_STEP) {
          blocked = true; // 선행이 서 있지 않으면 나도 설 수 없다
          break;
        }
        max = Math.max(max, depStep);
      }
      step = blocked ? UNRANKED_STEP : max + 1;
    }

    visiting.delete(slug);
    stepOf.set(slug, step);
    return step;
  };

  for (const t of tickets) visit(t.slug);
  return stepOf;
}
