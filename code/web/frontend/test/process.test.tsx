import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect } from "vitest";
import type { Feature, FeatureTicket, PlanBoardResponse, PlanCard } from "@gootte/contract";
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

describe("ProcessView — 2컬럼(1:2) 읽기 화면(process-two-column/T01)", () => {
  it("왼쪽 컬럼에 작업 대상 feature 목록이 선다 — slug 를 누르면 오른쪽이 바뀐다", () => {
    renderProcess({
      ...EMPTY_BOARD,
      active: [card(feature("a", [["01", "가"]]))],
    });
    const left = screen.getByText("FEATURES").closest("aside") as HTMLElement;
    expect(within(left).getByRole("button", { name: /a/ })).toBeInTheDocument();
  });

  it("기본으로 첫 feature 의 티켓이 오른쪽에 보인다", () => {
    renderProcess({
      ...EMPTY_BOARD,
      active: [card(feature("a", [["01", "한곳으로 모은다"]]))],
    });
    expect(screen.getByText("한곳으로 모은다")).toBeInTheDocument();
  });

  it("왼쪽에서 다른 feature 를 누르면 오른쪽 티켓 목록이 그 feature 것으로 바뀐다", () => {
    renderProcess({
      ...EMPTY_BOARD,
      active: [
        card(feature("a", [["01", "가 티켓"]])),
        card(feature("b", [["02", "나 티켓"]])),
      ],
    });
    // 기본 = 첫 feature a
    expect(screen.getByText("가 티켓")).toBeInTheDocument();
    // b 선택
    fireEvent.click(screen.getByRole("button", { name: /b/ }));
    expect(screen.getByText("나 티켓")).toBeInTheDocument();
    expect(screen.queryByText("가 티켓")).toBeNull();
  });

  it("🔴 처리중 티켓이 있는 feature 옆에 파란 원점이 찍힌다 — 없으면 점이 없다", () => {
    renderProcess({
      ...EMPTY_BOARD,
      active: [
        card(feature("working", [["01", "붙들린 것", "in_progress"]])),
        card(feature("idle", [["02", "남은 것"]])),
      ],
    });
    const left = screen.getByText("FEATURES").closest("aside") as HTMLElement;
    const workingBtn = within(left).getByRole("button", { name: /working/ });
    const idleBtn = within(left).getByRole("button", { name: /idle/ });
    expect(within(workingBtn).getByRole("status", { name: /처리중/ })).toBeInTheDocument();
    expect(within(idleBtn).queryByRole("status", { name: /처리중/ })).toBeNull();
  });

  it("신관례(tickets/) 티켓이 처리중이어도 왼쪽 원점이 찍힌다 — 두 관례를 합쳐 본다", () => {
    const nt: Feature = {
      ...feature("a", []),
      newTickets: [
        { ...feature("a", [["01", "x"]])["tickets"][0]!, status: "in_progress" as const },
      ],
    };
    renderProcess({ ...EMPTY_BOARD, active: [card(nt)] });
    const left = screen.getByText("FEATURES").closest("aside") as HTMLElement;
    const btn = within(left).getByRole("button", { name: /a/ });
    expect(within(btn).getByRole("status", { name: /처리중/ })).toBeInTheDocument();
  });

  it("왼쪽 feature 목록에 남은(open) 티켓 수가 배지로 보인다 — 완료·폐기는 세지 않는다", () => {
    renderProcess({
      ...EMPTY_BOARD,
      active: [
        card(
          feature("mixed", [
            ["01", "남은 것"],
            ["02", "끝난 것", "done", "2026-08-01"],
            ["03", "폐기된 것", "dropped"],
          ]),
        ),
      ],
    });
    const left = screen.getByText("FEATURES").closest("aside") as HTMLElement;
    const btn = within(left).getByRole("button", { name: /mixed/ });
    // 완료·폐기 2개를 제외한 남은 티켓 1개
    expect(within(btn).getByTitle("남은 티켓 수")).toHaveTextContent("1");
  });

  it("남은 티켓이 하나도 없으면 배지가 0 을 보여준다 — 감추지 않는다", () => {
    renderProcess({
      ...EMPTY_BOARD,
      active: [card(feature("all-done", [["01", "다 끝난 것", "done", "2026-08-01"]]))],
    });
    const left = screen.getByText("FEATURES").closest("aside") as HTMLElement;
    const btn = within(left).getByRole("button", { name: /all-done/ });
    expect(within(btn).getByTitle("남은 티켓 수")).toHaveTextContent("0");
  });

  it("오른쪽 컬럼에는 선택된 feature 의 **모든** 티켓이 보인다 — 완료([x])·폐기([-]) 도 숨기지 않는다(캡틴 지시)", () => {
    renderProcess({
      ...EMPTY_BOARD,
      active: [
        card(
          feature("mixed", [
            ["01", "끝난 것", "done", "2026-08-01"],
            ["02", "남은 것"],
            ["03", "폐기된 것", "dropped"],
          ]),
        ),
      ],
    });
    expect(screen.getByText("끝난 것")).toBeInTheDocument();
    expect(screen.getByText("남은 것")).toBeInTheDocument();
    expect(screen.getByText("폐기된 것")).toBeInTheDocument();
    const doneRow = screen.getByRole("button", { name: /끝난 것/ });
    expect(within(doneRow).getByText("[x]")).toBeInTheDocument();
    const droppedRow = screen.getByRole("button", { name: /폐기된 것/ });
    expect(within(droppedRow).getByText("[-]")).toBeInTheDocument();
    const openRow = screen.getByRole("button", { name: /남은 것/ });
    expect(within(openRow).getByText("[ ]")).toBeInTheDocument();
  });

  it("티켓 줄마다 번호와 제목이 보인다", () => {
    renderProcess({
      ...EMPTY_BOARD,
      active: [card(feature("auth-login", [["03", "세션 발급"]]))],
    });
    // 오른쪽 컬럼의 티켓 목록만 본다 — 왼쪽 feature 목록의 <li> 와 겹치지 않게 버튼으로 좁힌다.
    const row = screen.getByRole("button", { name: /세션 발급/ });
    expect(within(row).getByText("03")).toBeInTheDocument();
    expect(within(row).getByText("세션 발급")).toBeInTheDocument();
  });

  it("오른쪽 머리에 기능 이름과 설명문구가 두 줄로 선다 — plan 탭 카드 머리와 같은 자리", () => {
    renderProcess({
      ...EMPTY_BOARD,
      active: [card(feature("auth-login", [["01", "세션 발급"]]))],
    });
    // 오른쪽 컬럼 머리 — 왼쪽 목록 버튼과 겹치지 않게 "auth-login" 은 여럿이므로 제목 "제목" 만 본다.
    expect(screen.getByText("제목")).toBeInTheDocument();
    expect(screen.queryByText("auth-login — 제목")).toBeNull();
  });

  it("🔴 steps 탭에서도 기능 문서 목록을 열어 바로 읽는다 — plan 과 같은 컴포넌트(캡틴 지시 2026-09-04)", async () => {
    const f = feature("auth-login", [["01", "세션 발급"]]);
    const withDocs: Feature = {
      ...f,
      docs: [
        { kind: "file", name: "spec.md", path: "spec.md" },
        {
          kind: "dir",
          name: "adr",
          path: "adr",
          children: [{ kind: "file", name: "0001-x.md", path: "adr/0001-x.md" }],
        },
        // 🔴 티켓 폴더는 목록에 안 뜬다 — 티켓은 이 화면이 이미 오른쪽에 보여 준다.
        {
          kind: "dir",
          name: "tickets",
          path: "tickets",
          children: [{ kind: "file", name: "T01.md", path: "tickets/T01.md" }],
        },
      ],
    };
    const { qc } = renderProcess({ ...EMPTY_BOARD, active: [card(withDocs)] });
    qc.setQueryData(qk.featureDoc("alpha", "auth-login", "adr/0001-x.md"), {
      path: "adr/0001-x.md",
      content: "# 결정 하나\n",
    });

    fireEvent.click(screen.getByRole("button", { name: /auth-login 문서 열기/ }));
    const menu = screen.getByRole("menu", { name: /auth-login 문서/ });
    const items = within(menu).getAllByRole("menuitem").map((b) => b.textContent ?? "");
    expect(items.some((t) => t.includes("spec.md"))).toBe(true);
    expect(items.some((t) => t.includes("0001-x.md"))).toBe(true);
    expect(items.some((t) => t.includes("T01.md"))).toBe(false);

    fireEvent.click(within(menu).getByRole("menuitem", { name: /0001-x\.md/ }));
    const drawer = await screen.findByRole("dialog", { name: "adr/0001-x.md" });
    expect(within(drawer).getByRole("heading", { name: "결정 하나" })).toBeInTheDocument();
  });

  it("🔴 안 읽은 티켓 줄에 표시가 뜬다 — features 탭과 같은 표시(unread-tickets-show-themselves/02)", () => {
    const a = feature("a", [["01", "안 읽은 것"], ["02", "읽은 것"]]);
    const unreadFeature: Feature = {
      ...a,
      tickets: a.tickets.map((t) => ({ ...t, unread: t.num === "01" })),
    };
    renderProcess({ ...EMPTY_BOARD, active: [card(unreadFeature)] });
    const unreadRow = screen.getByText("안 읽은 것").closest("button") as HTMLElement;
    const readRow = screen.getByText("읽은 것").closest("button") as HTMLElement;
    expect(within(unreadRow).getByText("안 읽음")).toBeInTheDocument();
    expect(within(readRow).queryByText("안 읽음")).toBeNull();
  });

  it("🔴 처리중 여부가 줄까지 실려 온다 — 이 화면에서 다시 판정하지 않는다", () => {
    renderProcess({
      ...EMPTY_BOARD,
      active: [card(feature("a", [["01", "붙들린 것", "in_progress"]]))],
    });
    expect(
      within(screen.getByText("붙들린 것").closest("button") as HTMLElement).getByText("처리중"),
    ).toBeInTheDocument();
  });

  it("작업 대상이 비면 왼쪽 목록에 안내 한 줄이 보인다", () => {
    renderProcess(EMPTY_BOARD);
    // 왼쪽 목록과 오른쪽 컬럼 둘 다 비면 각각 안내를 낸다 — 둘 중 적어도 하나는 보인다.
    expect(screen.getAllByText("작업 대상에 올라온 것이 없다").length).toBeGreaterThan(0);
  });

  it("티켓 줄을 누르면 그 티켓 원문이 드로어로 열린다 — features 탭의 기존 통로를 그대로 쓴다", async () => {
    const { qc } = renderProcess({
      ...EMPTY_BOARD,
      active: [card(feature("auth-login", [["01", "세션 발급"]]))],
    });
    qc.setQueryData(qk.featureDoc("alpha", "auth-login", "issues/01-x.md"), {
      path: "issues/01-x.md",
      content: "# 01 — 세션 발급\n",
    });

    fireEvent.click(screen.getByRole("button", { name: /세션 발급/ }));

    const drawer = await screen.findByRole("dialog", { name: "issues/01-x.md" });
    expect(within(drawer).getByRole("heading", { name: "01 — 세션 발급" })).toBeInTheDocument();
  });
});

describe("ProcessView — 왼쪽 아래 대기 목록(a-waiting-card-is-one-drag-away/T01)", () => {
  it("왼쪽 아래 칸에 대기 칸의 feature 가 전부 선다 — 작업 대상과 한 <aside> 안이다", () => {
    renderProcess({
      ...EMPTY_BOARD,
      active: [card(feature("a", [["01", "가"]]))],
      waiting: [card(feature("w1")), card(feature("w2"))],
    });
    const aside = screen.getByText("FEATURES").closest("aside") as HTMLElement;
    const waiting = within(aside).getByRole("region", { name: "WAITING" });
    expect(within(waiting).getAllByRole("listitem")).toHaveLength(2);
    expect(within(waiting).getByText("w1")).toBeInTheDocument();
    expect(within(waiting).getByText("w2")).toBeInTheDocument();
  });

  it("대기 카드 제목은 plan 탭과 같은 규칙으로 이름을 뗀 설명문구다", () => {
    renderProcess({ ...EMPTY_BOARD, waiting: [card(feature("w1"))] });
    const waiting = screen.getByRole("region", { name: "WAITING" });
    // feature() 의 title 은 "w1 — 제목" — 이름이 겹쳐 붙은 앞부분만 뗀다.
    expect(within(waiting).getByText("제목")).toBeInTheDocument();
    expect(within(waiting).queryByText("w1 — 제목")).toBeNull();
  });

  it("경계에 크기 조절 손잡이가 있다 — 화살표 키로도 조절된다", () => {
    renderProcess({ ...EMPTY_BOARD, waiting: [card(feature("w1"))] });
    const handle = screen.getByRole("separator", { name: /경계/ });
    const before = Number(handle.getAttribute("aria-valuenow"));
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(Number(handle.getAttribute("aria-valuenow"))).toBeGreaterThan(before);
  });

  it("🔴 대기가 0 개면 빈 상자 대신 한 줄로 그 사실을 말한다 — 손잡이도 만들지 않는다", () => {
    renderProcess({ ...EMPTY_BOARD, active: [card(feature("a", [["01", "가"]]))] });
    expect(screen.getByText(/대기 중인 기능이 없다/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "WAITING" })).toBeNull();
    expect(screen.queryByRole("separator", { name: /경계/ })).toBeNull();
  });

  it("🔴 대기 카드는 집을 수 있는 손잡이를 갖는다 — 끌기는 dnd-kit 이다(T02)", () => {
    renderProcess({ ...EMPTY_BOARD, waiting: [card(feature("w1"))] });
    const waiting = screen.getByRole("region", { name: "WAITING" });
    // dnd-kit 의 `useDraggable` 이 얹는 배선 — 손잡이는 <li> 가 아니라 그 안의 상자다.
    const handle = within(waiting).getByRole("button", { name: /w1 — 위 칸으로 끌어 올리면/ });
    expect(handle).toHaveAttribute("aria-roledescription", "draggable");
    // 줄 자체는 여전히 목록 항목이다 — role 을 덮어쓰지 않았다.
    expect(within(waiting).getAllByRole("listitem")).toHaveLength(1);
  });

  it("🔴 위 칸(작업 대상)이 놓을 자리다 — 목록이 비어 있어도 접지 않는다(T02)", () => {
    const { container } = renderProcess({ ...EMPTY_BOARD, waiting: [card(feature("w1"))] });
    expect(container.querySelector('[data-drop-area="active"]')).not.toBeNull();
  });

  it("대기 목록이 생겨도 작업 대상 목록의 선택은 그대로 동작한다", () => {
    renderProcess({
      ...EMPTY_BOARD,
      active: [card(feature("a", [["01", "가 티켓"]])), card(feature("b", [["02", "나 티켓"]]))],
      waiting: [card(feature("w1"))],
    });
    const aside = screen.getByText("FEATURES").closest("aside") as HTMLElement;
    fireEvent.click(within(aside).getByRole("button", { name: /^b/ }));
    expect(screen.getByText("나 티켓")).toBeInTheDocument();
  });
});
