import { describe, expect, it } from "vitest";
import type { FeatureOrderEntry, PlanOrder, TicketOrderEntry } from "@gootte/contract";
import { detectOpinionTriggers, formatPlanSnapshot } from "./opinion";

function ticketOrder(feature: string, ticket: string, step: number, overrides: Partial<TicketOrderEntry> = {}): TicketOrderEntry {
  return {
    project: "p",
    feature,
    ticket,
    step,
    why: "…",
    whyNeedsReview: false,
    updatedAt: "t",
    ...overrides,
  };
}

function featureOrder(feature: string, overrides: Partial<FeatureOrderEntry> = {}): FeatureOrderEntry {
  return {
    project: "p",
    feature,
    track: "web",
    rank: 10,
    why: "…",
    whyNeedsReview: false,
    updatedAt: "t",
    ...overrides,
  };
}

function order(tickets: TicketOrderEntry[], features: FeatureOrderEntry[] = []): PlanOrder {
  return { project: "p", features, tickets };
}

describe("detectOpinionTriggers — 버튼이 뜨는 조건 셋(spec 06, 🔴 첫 커버)", () => {
  it("조건이 없으면 빈 배열 — 버튼도 요청도 안 생긴다", () => {
    const o = order([ticketOrder("a", "01", 1), ticketOrder("a", "02", 2)]);
    expect(detectOpinionTriggers(o)).toEqual([]);
  });

  it("엇갈림 — 한 기능의 티켓 사이에 다른 기능이 끼어들면 ticket_crossed", () => {
    const o = order([
      ticketOrder("a", "01", 1),
      ticketOrder("b", "01", 2),
      ticketOrder("a", "02", 3),
    ]);
    const kinds = detectOpinionTriggers(o).map((t) => t.kind);
    expect(kinds).toContain("ticket_crossed");
  });

  it("이웃한 단계라 낄 자리가 없으면 엇갈림이 아니다", () => {
    const o = order([ticketOrder("a", "01", 1), ticketOrder("a", "02", 2), ticketOrder("b", "01", 3)]);
    expect(detectOpinionTriggers(o).map((t) => t.kind)).not.toContain("ticket_crossed");
  });

  it("새 병렬 — 서로 다른 기능이 같은 단계에 놓이면 new_parallel", () => {
    const o = order([ticketOrder("a", "01", 1), ticketOrder("b", "01", 1)]);
    const triggers = detectOpinionTriggers(o);
    expect(triggers.map((t) => t.kind)).toContain("new_parallel");
    expect(triggers.find((t) => t.kind === "new_parallel")?.step).toBe(1);
  });

  it("같은 기능의 티켓끼리 같은 단계면 새 병렬이 아니다", () => {
    const o = order([ticketOrder("a", "01", 1), ticketOrder("a", "02", 1)]);
    expect(detectOpinionTriggers(o).map((t) => t.kind)).not.toContain("new_parallel");
  });

  it("뒤집힌 이유 — 티켓의 whyNeedsReview 가 서면 why_flipped", () => {
    const o = order([ticketOrder("a", "01", 1, { whyNeedsReview: true })]);
    const triggers = detectOpinionTriggers(o);
    expect(triggers).toHaveLength(1);
    expect(triggers[0]).toMatchObject({ kind: "why_flipped", feature: "a", step: 1 });
  });

  it("뒤집힌 이유 — 기능의 whyNeedsReview 가 서면 why_flipped(단계는 없다)", () => {
    const o = order([], [featureOrder("a", { whyNeedsReview: true })]);
    const triggers = detectOpinionTriggers(o);
    expect(triggers).toHaveLength(1);
    expect(triggers[0]).toMatchObject({ kind: "why_flipped", feature: "a", step: null });
  });

  it("세 조건이 동시에 뜰 수 있다 — 서로 막지 않는다", () => {
    const o = order(
      [
        ticketOrder("a", "01", 1),
        ticketOrder("b", "01", 2),
        ticketOrder("a", "02", 3, { whyNeedsReview: true }),
        ticketOrder("c", "01", 3),
      ],
      [featureOrder("a")],
    );
    const kinds = detectOpinionTriggers(o).map((t) => t.kind);
    expect(kinds).toContain("ticket_crossed");
    expect(kinds).toContain("new_parallel");
    expect(kinds).toContain("why_flipped");
  });
});

describe("formatPlanSnapshot — 누른 순간의 배치 스냅샷(verbatim)", () => {
  it("features·tickets 를 그대로 담는다", () => {
    const o = order([ticketOrder("a", "01", 1, { why: "먼저" })], [featureOrder("a", { why: "웹부터" })]);
    const text = formatPlanSnapshot(o);
    expect(text).toContain("project: p");
    expect(text).toContain("a — 웹부터");
    expect(text).toContain("step=1 a/01 — 먼저");
  });

  it("비어 있으면 없음으로 표시한다", () => {
    const text = formatPlanSnapshot(order([]));
    expect(text).toContain("(없음)");
  });
});
