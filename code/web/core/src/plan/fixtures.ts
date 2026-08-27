import type { Feature, FeatureTicket, Placement } from "@gootte/contract";

/**
 * 티켓 한 장의 지정 — 번호만 주면 미완(`draft`)이고, 상태를 재는 테스트(04)는 원문 상태와
 * 완료일까지 준다. **문서에서 오는 값만** 담는다 — 상자도 닫힘도 여기서 계산된다.
 */
export interface TicketSpec {
  num: string;
  /** 사상된 다섯 값 — `resolved`→done · `wontfix`→dropped(`core/src/parse/feature.ts` F5). */
  status?: FeatureTicket["status"];
  sourceStatus?: string;
  /** `resolved (YYYY-MM-DD)` 의 완료일. 날짜뿐이고 시각은 없다(spec F6). */
  completedAt?: string;
  /** 안 읽음 표시(`applyReadState` 가 계산하는 그 값, plan-board/11 이 판정에 그대로 쓴다). */
  unread?: boolean;
  /** `## 캡틴 확인` 절 유무(또는 표시 줄)가 계산한 값 — 기본은 필요 없음. */
  needsCaptainEye?: boolean;
  /**
   * 선행 번호(`Blocked by:`/`Depends on` 에서 읽힌 그 값, T01) — 기본은 없음(지금과 같다).
   * 주면 `waitingOn`·`startable` 이 형제 티켓의 완료 여부에서 계산된다(판정 자리와 같은 뜻).
   */
  blockedBy?: string[];
  /** 신관례 칸(`tickets/T<NN>.md`, T04)으로 넣는다 — 기본은 옛 관례(`issues/`). slug·path 를
   * core-io 가 실물에서 뽑는 모양(`T04` · `tickets/T04.md`)으로 만든다.
   */
  newConvention?: boolean;
  /** 걸린 시간 어림 문구(`elapsedPhrase` 결과, T02) — 기본은 없음. */
  elapsed?: string;
}

/**
 * 판 테스트가 함께 쓰는 픽스처 — `board.test.ts`(02)·`move.test.ts`(03)·`close.test.ts`(04)가
 * **같은 모양의 기능**을 본다. 판정 자리가 하나뿐이므로(spec §판정 자리는 하나뿐) 그것을 재는
 * 픽스처도 하나면 된다.
 *
 * 🔴 테스트 전용이다 — 패키지 barrel(`plan/index.ts`)에 싣지 않는다.
 */
export function feature(slug: string, tickets: readonly (string | TicketSpec)[] = []): Feature {
  const specs: TicketSpec[] = tickets.map((t) => (typeof t === "string" ? { num: t } : t));
  // 완료 형제 번호 — blockedBy 를 준 티켓의 waitingOn/startable 계산에 쓴다(NaN 은 어디에도
  // 같지 않으므로 번호로 안 풀리는 산문 선행은 언제나 대기다 — core 판정과 같은 규율).
  const doneNums = new Set(specs.filter((s) => s.status === "done").map((s) => Number.parseInt(s.num, 10)));
  const toTicket = (spec: TicketSpec) => {
    const waitingOn = (spec.blockedBy ?? []).filter((b) => !doneNums.has(Number.parseInt(b, 10)));
    return {
      num: spec.num,
      // 신관례는 core-io 가 실물에서 뽑는 모양 그대로 — slug 에 접미가 없고 경로가 tickets/ 다.
      slug: spec.newConvention ? `T${spec.num}` : `${spec.num}-x`,
      path: spec.newConvention ? `tickets/T${spec.num}.md` : `issues/${spec.num}-x.md`,
      title: `티켓 ${spec.num}`,
      status: spec.status ?? "pending",
      sourceStatus: spec.sourceStatus ?? "draft",
      statusKnown: true,
      ...(spec.completedAt ? { completedAt: spec.completedAt } : {}),
      ...(spec.unread !== undefined ? { unread: spec.unread } : {}),
      blockedBy: spec.blockedBy ?? [],
      unreadableBlockedBy: [],
      waitingOn,
      startable: waitingOn.length === 0,
      workedBy: [],
      needsCaptainEye: spec.needsCaptainEye ?? false,
      ...(spec.newConvention ? ({ docConvention: "tickets", backlogStatus: null } as const) : {}),
      ...(spec.elapsed ? { elapsed: spec.elapsed } : {}),
    };
  };
  return {
    slug,
    title: `${slug} — 제목`,
    status: "pending",
    sourceStatus: "draft",
    statusKnown: true,
    docs: [],
    conflict: [],
    tickets: specs.filter((s) => !s.newConvention).map(toTicket),
    // 신관례 칸(T04) — 신관례 전용 기능도 만들 수 있게 한다. 옛 관례 티켓이 하나도 없으면
    // `tickets` 는 실물과 같이 빈 배열이다.
    newTickets: specs.filter((s) => s.newConvention).map(toTicket),
  };
}

/** 완료 티켓 한 장 — 문서가 `resolved (날짜)` 라고 말하는 모양 그대로. */
export const resolved = (num: string, completedAt: string): TicketSpec => ({
  num,
  status: "done",
  sourceStatus: `resolved (${completedAt})`,
  completedAt,
});

/** 폐기 티켓 한 장 — 🔴 완료가 아니다. 상자는 빈 채로 남는다. */
export const wontfix = (num: string): TicketSpec => ({
  num,
  status: "dropped",
  sourceStatus: "wontfix",
});

export const row = (
  featureSlug: string,
  area: Placement["area"],
  seq = 0,
  closedAt: string | null = null,
): Placement => ({ feature: featureSlug, area, seq, closedAt });
