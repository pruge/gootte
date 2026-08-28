import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect } from "vitest";
import type { Feature, FeatureTicket, PlanBoardResponse, PlanCard } from "@gootte/contract";
import { computeNext } from "@gootte/core/plan";
import { ProcessView } from "../src/components/process/ProcessView";
import { qk } from "../src/lib/query";

/** `[번호, 제목]` 이면 미완, 상태·완료일까지 주면 문서가 그렇게 말하는 것이다(04, `ticketBoxState`가 계산). */
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

  it("🔴 같은 단계 안에서 기능별로 나뉜다 — 서로 다른 기능이 같은 단계 밑에 각자 다발로 선다(캡틴 지시)", () => {
    renderProcess({
      ...EMPTY_BOARD,
      active: [
        card(feature("a", [["01", "가"]]), { "01-x": 1 }),
        card(feature("b", [["01", "나"]]), { "01-x": 1 }),
      ],
    });
    const group = screen.getByRole("heading", { name: "1단계" }).closest("section") as HTMLElement;
    expect(within(group).getByText("a")).toBeInTheDocument();
    expect(within(group).getByText("가")).toBeInTheDocument();
    expect(within(group).getByText("b")).toBeInTheDocument();
    expect(within(group).getByText("나")).toBeInTheDocument();
  });

  it("줄마다 몇 번 티켓인지와 제목이 보이고, 어느 기능인지는 그 다발의 회색 헤더가 말한다", () => {
    renderProcess({
      ...EMPTY_BOARD,
      active: [card(feature("auth-login", [["03", "세션 발급"]]), { "03-x": 1 })],
    });
    expect(screen.getByText("auth-login")).toBeInTheDocument();
    const li = screen.getByRole("listitem");
    expect(within(li).getByText("03")).toBeInTheDocument();
    expect(within(li).getByText("세션 발급")).toBeInTheDocument();
    // 기능 이름은 다발 머리에만 있고, 티켓 줄 자체에는 되풀이되지 않는다.
    expect(within(li).queryByText("auth-login")).toBeNull();
  });

  it("🔴 기능 다발 머리는 이름과 설명문구를 두 줄로 싣는다 — plan 탭 카드 머리와 같은 자리(캡틴 지시)", () => {
    renderProcess({
      ...EMPTY_BOARD,
      active: [card(feature("auth-login", [["01", "세션 발급"]]), { "01-x": 1 })],
    });
    // 픽스처 표제는 `auth-login — 제목` — 이름과 설명이 겹치지 않고 각자 한 줄씩이다.
    expect(screen.getByText("auth-login")).toBeInTheDocument();
    expect(screen.getByText("제목")).toBeInTheDocument();
    expect(screen.queryByText("auth-login — 제목")).toBeNull();
  });

  it("설명이 없는 기능(표제가 곧 폴더명)은 다발 머리에 이름 한 줄만 선다", () => {
    const bare: Feature = { ...feature("bare", [["01", "하나"]]), title: "bare" };
    renderProcess({ ...EMPTY_BOARD, active: [card(bare, { "01-x": 1 })] });
    expect(screen.getByText("bare")).toBeInTheDocument();
  });

  it("각 기능 다발 밑에는 그 기능의 티켓만 선다 — 다른 기능 줄이 섞이지 않는다", () => {
    renderProcess({
      ...EMPTY_BOARD,
      active: [
        card(feature("a", [["01", "가1"], ["02", "가2"]]), { "01-x": 1, "02-x": 1 }),
        card(feature("b", [["01", "나1"]]), { "01-x": 1 }),
      ],
    });
    const bHeaderDiv = screen.getByText("b").closest("div") as HTMLElement;
    const bCluster = bHeaderDiv.parentElement as HTMLElement;
    expect(within(bCluster).getByText("나1")).toBeInTheDocument();
    expect(within(bCluster).queryByText("가1")).toBeNull();
    expect(within(bCluster).queryByText("가2")).toBeNull();
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
    const boxes = screen
      .getAllByTitle(/문서가 완료라고 말한다|아직 완료가 아니다/)
      .map((el) => el.textContent);
    expect(boxes).toEqual(["[x]", "[ ]"]);
  });

  it("🔴 안 읽은 티켓 줄에 표시가 뜬다 — features 탭과 같은 표시(unread-tickets-show-themselves/02)", () => {
    const a = feature("a", [["01", "안 읽은 것"], ["02", "읽은 것"]]);
    const unreadFeature: Feature = {
      ...a,
      tickets: a.tickets.map((t) => ({ ...t, unread: t.num === "01" })),
    };
    renderProcess({
      ...EMPTY_BOARD,
      active: [card(unreadFeature, { "01-x": 1, "02-x": 1 })],
    });
    const unreadRow = screen.getByText("안 읽은 것").closest("button") as HTMLElement;
    const readRow = screen.getByText("읽은 것").closest("button") as HTMLElement;
    expect(within(unreadRow).getByText("안 읽음")).toBeInTheDocument();
    expect(within(readRow).queryByText("안 읽음")).toBeNull();
  });

  it("🔴 네 조합이 전부 옳다 — 안읽음×처리중 / 안읽음×아님 / 읽음×처리중 / 읽음×아님(status-colors-tell-apart/02)", () => {
    const a = feature("a", [
      ["01", "안읽음 처리중", "in_progress"],
      ["02", "안읽음 아님", "pending"],
      ["03", "읽음 처리중", "in_progress"],
      ["04", "읽음 아님", "pending"],
    ]);
    const combo: Feature = {
      ...a,
      tickets: a.tickets.map((t) => ({ ...t, unread: t.num === "01" || t.num === "02" })),
    };
    renderProcess({
      ...EMPTY_BOARD,
      active: [card(combo, { "01-x": 1, "02-x": 1, "03-x": 1, "04-x": 1 })],
    });
    const rowOf = (title: string) => screen.getByText(title).closest("button") as HTMLElement;

    const unreadInProgress = rowOf("안읽음 처리중");
    expect(within(unreadInProgress).getByText("안 읽음")).toBeInTheDocument();
    expect(within(unreadInProgress).getByText("처리중")).toBeInTheDocument();

    const unreadOnly = rowOf("안읽음 아님");
    expect(within(unreadOnly).getByText("안 읽음")).toBeInTheDocument();
    expect(within(unreadOnly).queryByText("처리중")).toBeNull();

    const inProgressOnly = rowOf("읽음 처리중");
    expect(within(inProgressOnly).queryByText("안 읽음")).toBeNull();
    expect(within(inProgressOnly).getByText("처리중")).toBeInTheDocument();

    const neither = rowOf("읽음 아님");
    expect(within(neither).queryByText("안 읽음")).toBeNull();
    expect(within(neither).queryByText("처리중")).toBeNull();
  });

  it("🔴 처리중 여부가 단계 탭 줄까지 실려 온다 — 이 화면에서 다시 판정하지 않는다", () => {
    renderProcess({
      ...EMPTY_BOARD,
      active: [card(feature("a", [["01", "붙들린 것", "in_progress"]]), { "01-x": 1 })],
    });
    expect(within(screen.getByText("붙들린 것").closest("button") as HTMLElement).getByText("처리중")).toBeInTheDocument();
  });

  it("🔴 기능 다발 머리가 초록이 된다 — 안 읽은 티켓이 있으면(unread-tickets-show-themselves/03)", () => {
    const a = feature("a", [["01", "안 읽은 것"]]);
    const unreadFeature: Feature = { ...a, hasUnreadTicket: true, tickets: a.tickets.map((t) => ({ ...t, unread: true })) };
    renderProcess({ ...EMPTY_BOARD, active: [card(unreadFeature, { "01-x": 1 })] });
    const headerText = screen.getByText("a").closest("div") as HTMLElement;
    expect(within(headerText).getByText("안 읽음")).toBeInTheDocument();
  });

  it("안 읽은 티켓이 없으면 기능 다발 머리에 표시가 없다", () => {
    renderProcess({
      ...EMPTY_BOARD,
      active: [card({ ...feature("a", [["01", "읽은 것"]]), hasUnreadTicket: false }, { "01-x": 1 })],
    });
    const headerText = screen.getByText("a").closest("div") as HTMLElement;
    expect(within(headerText).queryByText("안 읽음")).toBeNull();
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

  it("🔴 미완 티켓 줄은 집을 수 있다 — 08 이 07 의 읽기 전용을 뒤집는다", () => {
    renderProcess({
      ...EMPTY_BOARD,
      active: [card(feature("a", [["01", "하나"]]), { "01-x": 1 })],
    });
    const row = screen.getByRole("button", { name: /하나/ });
    expect(row).toHaveAttribute("aria-roledescription", "draggable");
    expect(row).toHaveAttribute("aria-disabled", "false");
  });

  it("🔴 끝난 티켓([x])은 집히지 않는다(캡틴 결정)", () => {
    renderProcess({
      ...EMPTY_BOARD,
      active: [card(feature("a", [["01", "끝난 것", "done", "2026-08-01"]]), { "01-x": 1 })],
    });
    const row = screen.getByRole("button", { name: /끝난 것/ });
    expect(row).toHaveAttribute("aria-disabled", "true");
  });

  it("🔴 폐기 티켓([-])도 집히지 않는다(plan-board/12) — 안 할 일에 순서를 매길 이유가 없다", () => {
    renderProcess({
      ...EMPTY_BOARD,
      active: [card(feature("a", [["01", "폐기된 것", "dropped"]]), { "01-x": 1 })],
    });
    const row = screen.getByRole("button", { name: /폐기된 것/ });
    expect(row).toHaveAttribute("aria-disabled", "true");
    expect(within(row).getByTitle("문서가 폐기라고 말한다")).toHaveTextContent("[-]");
  });

  it("🔴 놓을 수 있는 자리가 집기 전에도 DOM 에 있다 — 카드마다 위·아래가 늘 있다(캡틴 지적: 있다가 없다가 헷갈린다)", () => {
    renderProcess({
      ...EMPTY_BOARD,
      active: [
        card(feature("a", [["01", "첫"]]), { "01-x": 1 }),
        card(feature("b", [["02", "둘째"]]), { "02-x": 2 }),
      ],
    });
    const gaps = screen.getAllByRole("note");
    // 1단계: 위(맨 앞) · 아래(사이). 2단계: 위(사이) · 아래(맨 뒤) — 카드마다 위·아래 둘 다 있다.
    expect(gaps.map((g) => g.getAttribute("aria-label"))).toEqual([
      "여기에 놓으면 새 단계가 맨 앞에 생긴다",
      "여기에 놓으면 사이에 새 단계가 생긴다",
      "여기에 놓으면 사이에 새 단계가 생긴다",
      "여기에 놓으면 번호 매겨진 단계들 맨 뒤에 새 단계가 생긴다",
    ]);
  });

  it("🔴 번호 매겨진 단계가 하나도 없으면 틈 하나뿐이다", () => {
    renderProcess({
      ...EMPTY_BOARD,
      active: [card(feature("a", [["01", "안 정해짐"]]), { "01-x": 9999 })],
    });
    const gaps = screen.getAllByRole("note");
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toHaveAttribute("aria-label", "여기에 놓으면 새 단계가 생긴다");
  });

  /**
   * T02(a-ticket-tells-how-long-it-took) — 걸린 시간 어림 문구가 기존 hover 문구 뒤에 이어
   * 붙는다. `plan` 탭 `CardDialog` 와 **같은 문구**여야 한다(plan.test.tsx 의 같은 이름 시험과
   * 짝) — 한쪽만 재면 갈라진 것을 못 잡는다.
   */
  it("🔴 걸린 시간 문구가 기존 hover 문구 뒤에 이어 붙는다 — 기존 문구는 살아 있다", () => {
    const f = feature("a", [["01", "끝난 것", "done", "2026-08-01"]]);
    const withElapsed: Feature = { ...f, tickets: f.tickets.map((t) => ({ ...t, elapsed: "약 14분" })) };
    renderProcess({ ...EMPTY_BOARD, active: [card(withElapsed, { "01-x": 1 })] });
    const row = screen.getByText("끝난 것").closest("button") as HTMLElement;
    // getByTitle 은 기본 normalizer 가 공백을 접는다 — 실제 title 은 줄바꿈으로 이어 붙는다(속성값 자체는 위 CardDialog·ProcessView 코드가 만든다).
    expect(within(row).getByTitle("문서가 완료라고 말한다 약 14분")).toBeInTheDocument();
  });

  it("걸린 시간 기록이 없으면 hover 문구에 아무것도 덧붙지 않는다(INV-4)", () => {
    renderProcess({
      ...EMPTY_BOARD,
      active: [card(feature("a", [["01", "끝난 것", "done", "2026-08-01"]]), { "01-x": 1 })],
    });
    const row = screen.getByText("끝난 것").closest("button") as HTMLElement;
    expect(within(row).getByTitle("문서가 완료라고 말한다")).toBeInTheDocument();
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

    // 기능 이름은 다발 머리에, 번호·제목은 줄에 나뉘어 있으니 묶음 전체 글자로 비교한다.
    const stepOneGroup = screen.getByRole("heading", { name: "1단계" }).closest("section") as HTMLElement;
    const shownStepOneRows = within(stepOneGroup).getAllByRole("listitem");
    const shownStepOneText = stepOneGroup.textContent ?? "";

    const placements = [
      { feature: "a", area: "active" as const, seq: 0, closedAt: null },
      { feature: "b", area: "active" as const, seq: 1, closedAt: null },
    ];
    const steps = [
      { feature: "a", ticket: "01-x", step: 1 },
      { feature: "b", ticket: "02-x", step: 2 },
    ];
    const next = computeNext([a, b], placements, steps);

    expect(shownStepOneRows).toHaveLength(next.length);
    for (const n of next) {
      expect(shownStepOneText).toContain(n.feature);
      expect(shownStepOneText).toContain(n.title);
    }
  });
});
