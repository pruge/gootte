import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect } from "vitest";
import type { Feature, FeatureTicket, PlanBoardResponse, PlanCard } from "@gootte/contract";
import { computeNext } from "@gootte/core/plan";
import { ProcessView } from "../src/components/process/ProcessView";
import { qk } from "../src/lib/query";

/** `[번호, 제목]` 이면 미완, 상태·완료일까지 주면 문서가 그렇게 말하는 것이다(04, `ticketChecked`가 계산). */
type TicketSpec = [num: string, title: string, status?: FeatureTicket["status"], completedAt?: string];

function feature(slug: string, tickets: TicketSpec[] = []): Feature {
  return {
    slug,
    title: `${slug} — 제목`,
    status: "pending",
    sourceStatus: "draft",
    statusKnown: true,
    docs: [{ kind: "file", name: "spec.md", path: "spec.md" }],
    tickets: tickets.map(([num, title, status = "pending", completedAt]) => ({
      num,
      slug: `${num}-x`,
      path: `issues/${num}-x.md`,
      title,
      status,
      sourceStatus: status === "done" ? `resolved (${completedAt})` : status === "dropped" ? "wontfix" : "draft",
      statusKnown: true,
      ...(completedAt ? { completedAt } : {}),
      blockedBy: [],
      unreadableBlockedBy: [],
      waitingOn: [],
      startable: true,
      workedBy: [],
      needsCaptainEye: false,
    })),
  };
}

const card = (f: Feature, steps?: Record<string, number>): PlanCard => ({
  feature: f,
  seq: 0,
  closedAt: null,
  ...(steps ? { steps } : {}),
});

const EMPTY_BOARD: PlanBoardResponse = {
  project: "alpha",
  waiting: [],
  active: [],
  reserved: [],
  discarded: [],
  done: [],
};

function renderProcess(board: PlanBoardResponse) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  qc.setQueryData(qk.plan("alpha"), board);
  return {
    qc,
    ...render(
      <QueryClientProvider client={qc}>
        <ProcessView project="alpha" />
      </QueryClientProvider>,
    ),
  };
}

describe("ProcessView — 작업 대상을 단계 순서로 줄 세운다(plan-board/07)", () => {
  it("단계 묶음마다 제목이 서고, 그 밑에 티켓 줄이 선다", () => {
    renderProcess({
      ...EMPTY_BOARD,
      active: [card(feature("a", [["01", "한곳으로 모은다"]]), { "01-x": 1 })],
    });
    expect(screen.getByRole("heading", { name: "1단계" })).toBeInTheDocument();
    expect(screen.getByText("한곳으로 모은다")).toBeInTheDocument();
  });

  it("🔴 기능으로 묶지 않는다 — 서로 다른 기능의 티켓이 같은 단계 밑에 나란히 선다", () => {
    renderProcess({
      ...EMPTY_BOARD,
      active: [
        card(feature("a", [["01", "가"]]), { "01-x": 1 }),
        card(feature("b", [["01", "나"]]), { "01-x": 1 }),
      ],
    });
    const group = screen.getByRole("heading", { name: "1단계" }).closest("section") as HTMLElement;
    const rows = within(group).getAllByRole("listitem").map((li) => li.textContent);
    expect(rows.some((r) => r?.includes("a") && r.includes("가"))).toBe(true);
    expect(rows.some((r) => r?.includes("b") && r.includes("나"))).toBe(true);
  });

  it("줄마다 어느 기능의 몇 번 티켓인지와 제목이 보인다", () => {
    renderProcess({
      ...EMPTY_BOARD,
      active: [card(feature("auth-login", [["03", "세션 발급"]]), { "03-x": 1 })],
    });
    expect(screen.getByText("auth-login / 03")).toBeInTheDocument();
    expect(screen.getByText("세션 발급")).toBeInTheDocument();
  });

  it("표시 단계가 1부터 연속이다 — 빈 단계가 걷혀 있다", () => {
    renderProcess({
      ...EMPTY_BOARD,
      active: [
        card(feature("a", [["01", "첫"]]), { "01-x": 1 }),
        card(feature("b", [["02", "둘째"]]), { "02-x": 2 }),
      ],
    });
    const headings = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(headings).toEqual(["1단계", "2단계"]);
  });

  it("🔴 9999 는 당겨지지 않고 맨 뒤에 제 제목을 달고 선다", () => {
    renderProcess({
      ...EMPTY_BOARD,
      active: [
        card(feature("a", [["01", "정해짐"]]), { "01-x": 1 }),
        card(feature("b", [["02", "안 정해짐"]]), { "02-x": 9999 }),
      ],
    });
    const headings = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(headings).toEqual(["1단계", "9999 — 아직 순서를 안 정했다"]);
  });

  it("🔴 상자는 04 와 같은 판정 — 완료 티켓은 [x], 아니면 [ ]", () => {
    renderProcess({
      ...EMPTY_BOARD,
      active: [
        card(
          feature("mixed", [
            ["01", "끝난 것", "done", "2026-08-01"],
            ["02", "남은 것"],
          ]),
          { "01-x": 1, "02-x": 1 },
        ),
      ],
    });
    const rows = screen.getAllByRole("listitem").map((li) => li.textContent?.slice(0, 3));
    expect(rows).toEqual(["[x]", "[ ]"]);
  });

  it("작업 대상 밖(대기·예약·폐기·완료)의 티켓은 하나도 나오지 않는다", () => {
    renderProcess({
      ...EMPTY_BOARD,
      waiting: [card(feature("idle", [["01", "대기중"]]))],
      reserved: [card(feature("later", [["01", "예약됨"]]))],
      discarded: [card(feature("scrapped", [["01", "폐기됨"]]))],
      done: [card(feature("shipped", [["01", "완료됨"]]))],
    });
    expect(screen.queryByText("대기중")).toBeNull();
    expect(screen.queryByText("예약됨")).toBeNull();
    expect(screen.queryByText("폐기됨")).toBeNull();
    expect(screen.queryByText("완료됨")).toBeNull();
    expect(screen.getByText("작업 대상에 올라온 것이 없다")).toBeInTheDocument();
  });

  it("끌어 옮기기가 없다 — 화면에 draggable 요소가 없다", () => {
    renderProcess({
      ...EMPTY_BOARD,
      active: [card(feature("a", [["01", "하나"]]), { "01-x": 1 })],
    });
    expect(document.querySelector("[draggable=true]")).toBeNull();
  });

  it("작업 대상이 비면 안내 한 줄이 보인다", () => {
    renderProcess(EMPTY_BOARD);
    expect(screen.getByText("작업 대상에 올라온 것이 없다")).toBeInTheDocument();
  });

  it("티켓 줄을 누르면 그 티켓 원문이 드로어로 열린다 — features 탭의 기존 통로를 그대로 쓴다", async () => {
    const { qc } = renderProcess({
      ...EMPTY_BOARD,
      active: [card(feature("auth-login", [["01", "세션 발급"]]), { "01-x": 1 })],
    });
    qc.setQueryData(qk.featureDoc("alpha", "auth-login", "issues/01-x.md"), {
      path: "issues/01-x.md",
      content: "# 01 — 세션 발급\n",
    });

    fireEvent.click(screen.getByRole("button", { name: /세션 발급/ }));

    const drawer = await screen.findByRole("dialog", { name: "issues/01-x.md" });
    expect(within(drawer).getByRole("heading", { name: "01 — 세션 발급" })).toBeInTheDocument();
  });

  it("🔴 문서가 바뀌면 새로 고치지 않아도 단계 묶음이 다시 그려진다(실시간 갱신)", async () => {
    const { qc } = renderProcess({
      ...EMPTY_BOARD,
      active: [card(feature("a", [["01", "첫"], ["02", "둘"]]), { "01-x": 1, "02-x": 2 })],
    });
    expect(screen.getByText("둘")).toBeInTheDocument();
    expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual(["1단계", "2단계"]);

    // 01 이 완료되어 02 가 1단계로 당겨진 새 판 — WS invalidate 가 가져오는 것과 같은 모양.
    qc.setQueryData(qk.plan("alpha"), {
      ...EMPTY_BOARD,
      active: [
        card(feature("a", [["01", "첫", "done", "2026-08-12"], ["02", "둘"]]), { "02-x": 1 }),
      ],
    });

    await waitFor(() => expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual(["1단계"]));
  });

  it("🔴 이 화면의 1단계 집합이 gootte next 의 결과와 같다", () => {
    const a = feature("a", [["01", "가"]]);
    const b = feature("b", [["02", "나"]]);
    const board: PlanBoardResponse = {
      ...EMPTY_BOARD,
      active: [card(a, { "01-x": 1 }), card(b, { "02-x": 2 })],
    };
    renderProcess(board);

    const stepOneGroup = screen.getByRole("heading", { name: "1단계" }).closest("section") as HTMLElement;
    const shownStepOne = within(stepOneGroup)
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "");

    const placements = [
      { feature: "a", area: "active" as const, seq: 0, closedAt: null },
      { feature: "b", area: "active" as const, seq: 1, closedAt: null },
    ];
    const steps = [
      { feature: "a", ticket: "01-x", step: 1 },
      { feature: "b", ticket: "02-x", step: 2 },
    ];
    const next = computeNext([a, b], placements, steps);

    expect(shownStepOne).toHaveLength(next.length);
    for (const n of next) {
      expect(shownStepOne.some((row) => row.includes(n.feature) && row.includes(n.title))).toBe(true);
    }
  });
});
