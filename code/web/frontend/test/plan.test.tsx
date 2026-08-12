import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Feature, FeatureTicket, PlanBoardResponse, PlanCard } from "@gootte/contract";
import { PlanView } from "../src/components/plan/PlanView";
import { qk } from "../src/lib/query";

/**
 * 티켓 한 장 — `[번호, 제목]` 이면 미완이고, 상태와 완료일까지 주면 문서가 그렇게 말하는 것이다.
 * 🔴 상자 값은 여기 없다 — 상자는 이 상태에서 **계산된다**(04, `ticketChecked`).
 */
type TicketSpec = [num: string, title: string, status?: FeatureTicket["status"], completedAt?: string];

/** 서버가 이미 다섯 칸으로 갈라 보낸 값 — 화면은 다시 가르지 않는다(spec §판정 자리는 하나뿐). */
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

const card = (f: Feature, seq: number | null = null, closedAt: string | null = null): PlanCard => ({
  feature: f,
  seq,
  closedAt,
});

const EMPTY_BOARD: PlanBoardResponse = {
  project: "alpha",
  waiting: [],
  active: [],
  reserved: [],
  discarded: [],
  done: [],
};

const openFeatureDoc = vi.fn();

function renderBoard(board: PlanBoardResponse) {
  // 판은 이미 심어 둔 것을 그린다 — `staleTime: Infinity` 라 마운트 때 다시 받아오지 않는다.
  // 그래서 아래 fetch 감시가 잡는 것은 **캡틴이 옮긴 요청뿐**이다.
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  qc.setQueryData(qk.plan("alpha"), board);
  return {
    qc,
    ...render(
      <QueryClientProvider client={qc}>
        <PlanView project="alpha" onOpenFeatureDoc={openFeatureDoc} />
      </QueryClientProvider>,
    ),
  };
}

/** 아래 칸의 탭 하나를 눌러 그 칸을 연다. */
const openTab = (label: string) => fireEvent.click(screen.getByRole("tab", { name: new RegExp(label) }));

/** 카드 머리 단추 — 아이콘 둘과 형제라 이름으로 가른다(머리에만 티켓 수가 붙어 있다). */
const cardHeader = (title: string): HTMLElement =>
  within(screen.getByRole("article", { name: title })).getByRole("button", { name: /티켓 \d/ });

/**
 * 판에는 카드 머리만 보인다(캡틴 결정) — 티켓 목록은 머리글을 눌러 **대화상자로** 연다.
 * 돌려주는 것은 카드가 아니라 그 창이다.
 */
const openCard = (title: string): HTMLElement => {
  fireEvent.click(cardHeader(title));
  return screen.getByRole("dialog");
};

/** 창의 `확인` — 캡틴이 닫는 길(대화상자 닫기 단추·ESC 와 같은 자리로 간다). */
const confirmDialog = () => fireEvent.click(screen.getByRole("button", { name: "확인" }));

describe("PlanView — 다섯 자리 판(plan-board/02)", () => {
  it("다섯 칸이 그려진다 — 위 작업 대상 하나, 아래 네 탭", () => {
    renderBoard(EMPTY_BOARD);
    expect(screen.getByRole("heading", { name: "작업 대상" })).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["대기0", "예약0", "폐기0", "완료0"]);
  });

  it("🔴 자리 행이 없는 기능은 대기 칸에 뜬다 — 등록이라는 절차가 없다(INV-B1)", () => {
    renderBoard({ ...EMPTY_BOARD, waiting: [card(feature("auth-login"))] });
    expect(screen.getByRole("heading", { name: "auth-login 제목" })).toBeInTheDocument();
  });

  it("🔴 카드 머리는 두 줄이다 — 기능 이름과 설명문구, 이름은 한 번만(캡틴 결정)", () => {
    renderBoard({ ...EMPTY_BOARD, waiting: [card(feature("auth-login"))] });
    const card1 = screen.getByRole("article", { name: "auth-login 제목" });
    // 이름 한 줄 + 설명 한 줄. 표제에 겹쳐 있던 "auth-login — " 은 떨어져 나갔다.
    expect(within(card1).getByText("auth-login")).toBeInTheDocument();
    expect(within(card1).getByText("제목")).toBeInTheDocument();
    expect(within(card1).queryByText("auth-login — 제목")).toBeNull();
  });

  it("설명이 없는 기능(표제가 곧 폴더명)은 이름 한 줄만 그린다", () => {
    const f = { ...feature("bare"), title: "bare" };
    renderBoard({ ...EMPTY_BOARD, waiting: [card(f)] });
    const only = screen.getByRole("article", { name: "bare" });
    expect(within(only).getByText("bare")).toBeInTheDocument();
  });

  it("🔴 판에는 카드 머리만 보인다 — 티켓 줄은 없고 티켓 수는 머리에 남는다(캡틴 결정)", () => {
    renderBoard({
      ...EMPTY_BOARD,
      waiting: [card(feature("auth-login", [["01", "세션 발급"], ["02", "로그인 화면"]]))],
    });
    const card1 = screen.getByRole("article", { name: "auth-login 제목" });
    expect(within(card1).queryByText("세션 발급")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    // 머리만 보여도 카드가 제 크기를 말한다.
    expect(within(card1).getByText("티켓 2")).toBeInTheDocument();
  });

  it("머리글을 누르면 대화상자가 떠 티켓들이 줄로 보인다 — 문서에서 온 값이다(INV-5)", () => {
    renderBoard({
      ...EMPTY_BOARD,
      waiting: [card(feature("auth-login", [["01", "세션 발급"], ["02", "로그인 화면"]]))],
    });
    const opened = openCard("auth-login 제목");
    expect(within(opened).getByText("세션 발급")).toBeInTheDocument();
    expect(within(opened).getByText("로그인 화면")).toBeInTheDocument();
    // 창은 카드가 이고 있던 것을 그대로 이어 받는다 — 열었다고 사실이 사라지지 않게.
    expect(within(opened).getByText("티켓 2")).toBeInTheDocument();
  });

  it("확인을 누르면 창이 닫힌다 — 열림은 화면의 상태일 뿐 저장되지 않는다(캡틴 결정)", () => {
    renderBoard({ ...EMPTY_BOARD, waiting: [card(feature("auth-login", [["01", "세션 발급"]]))] });
    openCard("auth-login 제목");
    confirmDialog();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("세션 발급")).toBeNull();
  });

  it("ESC 로도 닫힌다 — 창 하나에 닫는 길이 확인·ESC·바깥 누르기 셋이다", () => {
    renderBoard({ ...EMPTY_BOARD, waiting: [card(feature("auth-login", [["01", "세션 발급"]]))] });
    openCard("auth-login 제목");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("한 카드를 열면 그 카드의 티켓만 보인다 — 옆 카드가 딸려 열리지 않는다", () => {
    renderBoard({
      ...EMPTY_BOARD,
      waiting: [card(feature("a", [["01", "가 티켓"]])), card(feature("b", [["01", "나 티켓"]]))],
    });
    const opened = openCard("a 제목");
    expect(within(opened).getByText("가 티켓")).toBeInTheDocument();
    expect(screen.queryByText("나 티켓")).toBeNull();
  });

  it("작업 대상 칸에는 그 칸의 카드만 보인다", () => {
    renderBoard({
      ...EMPTY_BOARD,
      active: [card(feature("moving"), 0)],
      waiting: [card(feature("idle"))],
    });
    const active = screen.getByRole("region", { name: "작업 대상" });
    expect(within(active).getByRole("heading", { name: "moving 제목" })).toBeInTheDocument();
    expect(within(active).queryByRole("heading", { name: "idle 제목" })).toBeNull();
  });

  it("아래 네 칸은 탭으로 전환된다 — 예약·폐기·완료가 각자 자기 카드를 보여준다", () => {
    renderBoard({
      ...EMPTY_BOARD,
      reserved: [card(feature("later"))],
      discarded: [card(feature("scrapped"))],
      done: [card(feature("shipped"), 1, "2026-08-12T09:30:00+09:00")],
    });
    // 처음 열려 있는 것은 대기 — 비어 있다.
    expect(screen.queryByRole("heading", { name: "later 제목" })).toBeNull();

    openTab("예약");
    expect(screen.getByRole("heading", { name: "later 제목" })).toBeInTheDocument();

    openTab("폐기");
    expect(screen.getByRole("heading", { name: "scrapped 제목" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "later 제목" })).toBeNull();

    openTab("완료");
    const done = screen.getByRole("article", { name: "shipped 제목" });
    // 닫힌 시각은 문서에 없는 값이라 계획 DB 가 갖는다(INV-5) — 접힌 머리에서도 보인다.
    // 무엇의 시각인지 이름표를 달고 선다(04) — 문서의 완료 날짜와 나란히 서기 때문이다.
    expect(within(done).getByText("닫힘 2026-08-12T09:30:00+09:00")).toBeInTheDocument();
  });

  it("각 탭이 자기 칸의 카드 수를 달고 있다 — 화면이 세지 않고 목록 길이를 읽는다", () => {
    renderBoard({
      ...EMPTY_BOARD,
      waiting: [card(feature("a")), card(feature("b"))],
      done: [card(feature("c"))],
    });
    expect(screen.getByRole("tab", { name: /대기/ }).textContent).toBe("대기2");
    expect(screen.getByRole("tab", { name: /완료/ }).textContent).toBe("완료1");
  });

  it("티켓이 없는 기능도 카드로 뜨고, 열면 없다고 말한다 — 감추면 화면이 거짓말한다", () => {
    renderBoard({ ...EMPTY_BOARD, waiting: [card(feature("no-tickets"))] });
    expect(screen.getByRole("article", { name: "no-tickets 제목" })).toBeInTheDocument();
    const opened = openCard("no-tickets 제목");
    expect(within(opened).getByText("티켓이 없습니다.")).toBeInTheDocument();
  });

  it("빈 판도 다섯 칸이 그대로 서 있다 — 칸이 사라지지 않는다", () => {
    renderBoard(EMPTY_BOARD);
    expect(screen.getByText("작업 대상이 비어 있습니다.")).toBeInTheDocument();
    expect(screen.getByText("docs/features/ 아래 기능이 없습니다.")).toBeInTheDocument();
  });
});

/**
 * 캡틴이 카드를 옮긴다(plan-board/03).
 * 끌기 자체는 손에 붙는지 봐야 아는 일이라 **캡틴 확인**이 맡는다(티켓 03 §테스트).
 * 여기서 재는 것은 아이콘 둘·이동 대화상자·여러 장 고르기, 그리고 **묻지 않는다는 사실**이다.
 */
describe("PlanView — 카드 머리 아이콘 둘과 이동 대화상자(plan-board/03)", () => {
  const cardOf = (name: string) => screen.getByRole("article", { name });
  const clickIcon = (name: string, label: RegExp) =>
    fireEvent.click(within(cardOf(name)).getByRole("button", { name: label }));

  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    openFeatureDoc.mockClear();
    fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => moved(JSON.parse(String(init?.body))),
    }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  /** 서버가 돌려주는 "옮긴 뒤의 판" 흉내 — 화면은 이것을 **그대로** 받아 그린다(INV-1). */
  const moved = (body: { features: string[]; area: string | null }): PlanBoardResponse => ({
    ...EMPTY_BOARD,
    [body.area ?? "waiting"]: body.features.map((slug) => card(feature(slug), 0)),
  });

  const sent = () => JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));

  it("문서 아이콘은 features 탭의 기존 통로로 보낸다 — 두 번째 문서 보기를 짓지 않는다", () => {
    renderBoard({ ...EMPTY_BOARD, waiting: [card(feature("auth-login"))] });
    clickIcon("auth-login 제목", /문서 열기/);
    expect(openFeatureDoc).toHaveBeenCalledWith("auth-login", "spec.md");
  });

  it("문서가 하나도 없는 기능은 열 문서가 없다고 말한다 — 없는 주소를 지어내지 않는다", () => {
    const bare = { ...feature("no-docs"), docs: [] };
    renderBoard({ ...EMPTY_BOARD, waiting: [card(bare)] });
    clickIcon("no-docs 제목", /문서 열기/);
    expect(openFeatureDoc).toHaveBeenCalledWith("no-docs", null);
  });

  it("이동 아이콘은 대화상자를 띄우고, 🔴 지금 있는 칸은 고를 수 없다", () => {
    renderBoard({ ...EMPTY_BOARD, active: [card(feature("moving"), 0)] });
    clickIcon("moving 제목", /다른 칸으로 보내기/);
    const dialog = screen.getByRole("dialog", { name: "어느 칸으로 보낼까요" });
    const options = within(dialog)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(options).toContain("예약");
    expect(options).toContain("완료");
    expect(options).not.toContain("작업 대상");
  });

  it("대화상자에서 칸을 고르면 그 칸으로 간다 — 판은 서버가 돌려준 것을 그대로 그린다", async () => {
    renderBoard({ ...EMPTY_BOARD, waiting: [card(feature("auth-login"))] });
    clickIcon("auth-login 제목", /다른 칸으로 보내기/);
    fireEvent.click(screen.getByRole("button", { name: "작업 대상" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/plan/alpha/move");
    expect(sent()).toEqual({ features: ["auth-login"], area: "active", index: 0 });
    await waitFor(() =>
      expect(
        within(screen.getByRole("region", { name: "작업 대상" })).getByRole("heading", {
          name: "auth-login 제목",
        }),
      ).toBeInTheDocument(),
    );
  });

  it("🔴 대기로 돌려보내는 요청은 자리 값이 null 이다 — 대기를 뜻하는 값이 없다(INV-B1)", async () => {
    renderBoard({ ...EMPTY_BOARD, active: [card(feature("back"), 0)] });
    clickIcon("back 제목", /다른 칸으로 보내기/);
    fireEvent.click(screen.getByRole("button", { name: /대기/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sent().area).toBeNull();
  });

  it("🔴 남은 티켓이 있어도 완료로 옮겨진다 — 이유를 묻는 입력창이 뜨지 않는다(캡틴 결정)", async () => {
    renderBoard({
      ...EMPTY_BOARD,
      active: [card(feature("half", [["01", "남은 일"]]), 0)],
    });
    clickIcon("half 제목", /다른 칸으로 보내기/);
    fireEvent.click(screen.getByRole("button", { name: "완료" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sent()).toMatchObject({ features: ["half"], area: "done" });
    // 대화상자는 닫혔고, 이유를 받는 입력칸도 확인창도 어디에도 없다.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("⌘+클릭으로 여러 장을 고르면 한 번에 옮겨진다(캡틴 제안 2)", async () => {
    renderBoard({ ...EMPTY_BOARD, waiting: [card(feature("a")), card(feature("b"))] });
    fireEvent.click(cardHeader("a 제목"), { metaKey: true });
    fireEvent.click(cardHeader("b 제목"), { metaKey: true });
    // 고른 것은 눈에 보인다 — 몇 장인지 화면이 말한다.
    expect(screen.getByText(/대기 2장 고름/)).toBeInTheDocument();

    clickIcon("a 제목", /다른 칸으로 보내기/);
    fireEvent.click(screen.getByRole("button", { name: "작업 대상" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sent().features).toEqual(["a", "b"]);
  });

  it("⌘+클릭은 카드를 열지 않는다 — 고르는 것과 여는 것이 섞이지 않는다", () => {
    renderBoard({ ...EMPTY_BOARD, waiting: [card(feature("a", [["01", "티켓 하나"]]))] });
    fireEvent.click(cardHeader("a 제목"), { metaKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("티켓 하나")).toBeNull();
  });

  it("다른 칸의 카드를 고르면 묶음이 그 칸으로 옮겨간다 — 안 보이는 카드가 딸려 가지 않게", () => {
    renderBoard({
      ...EMPTY_BOARD,
      active: [card(feature("up"), 0)],
      waiting: [card(feature("down"))],
    });
    const pick = (name: string) => fireEvent.click(cardHeader(name), { metaKey: true });
    pick("up 제목");
    expect(screen.getByText(/작업 대상 1장 고름/)).toBeInTheDocument();
    pick("down 제목");
    expect(screen.getByText(/대기 1장 고름/)).toBeInTheDocument();
  });

  it("옮기지 못하면 그렇게 말한다 — 옮겨진 척하지 않는다", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "문서가 없는 기능입니다: ghost" }),
    });
    renderBoard({ ...EMPTY_BOARD, waiting: [card(feature("ghost"))] });
    clickIcon("ghost 제목", /다른 칸으로 보내기/);
    fireEvent.click(screen.getByRole("button", { name: "작업 대상" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("문서가 없는 기능입니다: ghost"),
    );
    // 카드는 제자리에 남는다.
    expect(
      within(screen.getByRole("region", { name: "작업 대상" })).queryByRole("heading", {
        name: "ghost 제목",
      }),
    ).toBeNull();
  });

  it("대화상자는 ESC 로 닫히고 아무것도 옮기지 않는다", () => {
    renderBoard({ ...EMPTY_BOARD, waiting: [card(feature("a"))] });
    clickIcon("a 제목", /다른 칸으로 보내기/);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * 티켓이 스스로 체크되고, 다 되면 카드가 닫힌다(plan-board/04).
 *
 * 🔴 여기서 재는 것은 **상자와 접힘**뿐이다 — 무엇이 닫히는지는 `core/src/plan/close.test.ts` 가,
 * 그것이 계획 DB 에 앉는지는 backend 가 덮는다. 화면은 판정하지 않는다(spec §판정 자리는 하나뿐).
 */
describe("PlanView — 티켓 상자와 닫힌 카드(plan-board/04)", () => {
  /** 창에 뜬 티켓 줄들의 상자 — 목록은 대화상자가 갖는다(캡틴 결정). */
  const boxesIn = (opened: HTMLElement): string[] =>
    within(opened)
      .getAllByRole("listitem")
      .map((li) => li.textContent?.slice(0, 3) ?? "");

  it("티켓 줄마다 상태에 맞는 상자가 선다 — 완료면 [x], 아니면 [ ]", () => {
    renderBoard({
      ...EMPTY_BOARD,
      active: [
        card(
          feature("mixed", [
            ["01", "끝난 것", "done", "2026-08-01"],
            ["02", "남은 것"],
          ]),
          0,
        ),
      ],
    });
    expect(boxesIn(openCard("mixed 제목"))).toEqual(["[x]", "[ ]"]);
  });

  it("🔴 폐기 티켓은 빈 상자다 — 끝난 것과 안 하는 것을 같게 그리지 않는다", () => {
    renderBoard({
      ...EMPTY_BOARD,
      active: [card(feature("wf", [["01", "안 할 것", "dropped"]]), 0)],
    });
    const c = openCard("wf 제목");
    expect(boxesIn(c)).toEqual(["[ ]"]);
    // 원문 상태는 그 줄에 verbatim 으로 남아 어느 쪽인지 말한다(INV-4).
    expect(within(c).getByText("wontfix")).toBeInTheDocument();
  });

  it("🔴 문서가 바뀌면 새로 고치지 않아도 상자가 바뀐다 — 판을 다시 받는 것으로 족하다", async () => {
    const open = feature("live", [["01", "하나"]]);
    const { qc } = renderBoard({ ...EMPTY_BOARD, active: [card(open, 0)] });
    expect(boxesIn(openCard("live 제목"))).toEqual(["[ ]"]);

    // 실시간 배선(WS → plan 쿼리 invalidate)이 가져오는 것과 같은 새 판을 앉힌다.
    qc.setQueryData(qk.plan("alpha"), {
      ...EMPTY_BOARD,
      active: [card(feature("live", [["01", "하나", "done", "2026-08-12"]]), 0)],
    });

    // 🔴 다시 그리라고 아무도 시키지 않는다 — 판이 바뀌었으니 **열어 둔 창까지** 따라온다.
    await waitFor(() => expect(boxesIn(screen.getByRole("dialog"))).toEqual(["[x]"]));
  });

  it("완료 칸의 카드도 머리만 보이고, 누르면 창이 뜨고, 확인을 누르면 닫힌다(캡틴 결정)", () => {
    renderBoard({
      ...EMPTY_BOARD,
      done: [card(feature("shut", [["01", "끝난 것", "done", "2026-08-02"]]), 0, "2026-08-12 17:40")],
    });
    openTab("완료");
    expect(within(screen.getByRole("article", { name: "shut 제목" })).queryByText("끝난 것")).toBeNull();

    const opened = openCard("shut 제목");
    expect(within(opened).getByText("끝난 것")).toBeInTheDocument();

    confirmDialog();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("끝난 것")).toBeNull();
  });

  it("🔴 남은 티켓을 안고 닫힌 카드는 빈 상자를 그대로 보여 준다(INV-B4)", () => {
    renderBoard({
      ...EMPTY_BOARD,
      done: [
        card(
          feature("covered", [
            ["01", "끝난 것", "done", "2026-08-02"],
            ["02", "남은 것"],
          ]),
          0,
          "2026-08-12 17:40",
        ),
      ],
    });
    openTab("완료");
    const c = openCard("covered 제목");
    expect(boxesIn(c)).toEqual(["[x]", "[ ]"]);
    expect(within(c).getByText("남은 것")).toBeInTheDocument();
  });

  it("🔴 닫은 시각과 문서의 완료 날짜를 각각 보여 준다 — 한 값으로 뭉개지 않는다", () => {
    renderBoard({
      ...EMPTY_BOARD,
      done: [
        card(
          feature("two-times", [
            ["01", "먼저", "done", "2026-08-02"],
            ["02", "나중", "done", "2026-08-09"],
          ]),
          0,
          "2026-08-12 17:40",
        ),
      ],
    });
    openTab("완료");
    const c = screen.getByRole("article", { name: "two-times 제목" });
    expect(within(c).getByText("닫힘 2026-08-12 17:40")).toBeInTheDocument();
    // 문서 쪽은 마지막 티켓이 끝난 날 — 날짜뿐이고 시각이 없다(spec F6).
    expect(within(c).getByText("문서 완료 2026-08-09")).toBeInTheDocument();
  });

  it("문서에 완료 날짜가 없는 채로 닫힌 카드는 없다고 말한다 — 지어내지 않는다", () => {
    renderBoard({
      ...EMPTY_BOARD,
      done: [card(feature("bare", [["01", "남은 것"]]), 0, "2026-08-12 17:40")],
    });
    openTab("완료");
    const c = screen.getByRole("article", { name: "bare 제목" });
    expect(within(c).getByText("문서 완료일 없음")).toBeInTheDocument();
  });

  it("닫히지 않은 카드에는 시각 줄이 없다 — 없는 값을 자리로 만들지 않는다", () => {
    renderBoard({ ...EMPTY_BOARD, active: [card(feature("open", [["01", "하나"]]), 0)] });
    const c = screen.getByRole("article", { name: "open 제목" });
    expect(within(c).queryByText(/닫힘/)).toBeNull();
  });
});

/**
 * 카드 대화상자의 티켓 줄을 누르면 원문이 열린다(캡틴 결정 2026-08-12: "ticket 클릭하면 문서
 * 보이게해"). 새 뷰어를 짓지 않고 `features` 탭의 `DocDrawer` 를 그대로 재사용한다 — 여기서 재는
 * 것은 **판이 그 재사용 통로를 올바른 주소로 여는가**뿐이다. 렌더링 자체는 `doc-drawer.test.tsx`.
 */
describe("PlanView — 카드 대화상자에서 티켓 원문을 연다", () => {
  it("티켓 줄을 누르면 그 티켓의 issues/*.md 가 드로어로 뜬다", async () => {
    const { qc } = renderBoard({
      ...EMPTY_BOARD,
      waiting: [card(feature("auth-login", [["01", "세션 발급"]]))],
    });
    qc.setQueryData(qk.featureDoc("alpha", "auth-login", "issues/01-x.md"), {
      path: "issues/01-x.md",
      content: "# 01 — 세션 발급\n",
    });

    const opened = openCard("auth-login 제목");
    fireEvent.click(within(opened).getByRole("button", { name: /세션 발급/ }));

    const drawer = await screen.findByRole("dialog", { name: "issues/01-x.md" });
    expect(within(drawer).getByRole("heading", { name: "01 — 세션 발급" })).toBeInTheDocument();
    // 🔴 탭은 그대로 plan 이다 — 문서 아이콘(03)과 달리 판을 떠나지 않는다.
    expect(screen.getByRole("article", { name: "auth-login 제목" })).toBeInTheDocument();
  });

  it("드로어를 닫으면 카드 대화상자로 그대로 돌아온다", async () => {
    const { qc } = renderBoard({
      ...EMPTY_BOARD,
      waiting: [card(feature("auth-login", [["01", "세션 발급"]]))],
    });
    qc.setQueryData(qk.featureDoc("alpha", "auth-login", "issues/01-x.md"), {
      path: "issues/01-x.md",
      content: "# 01 — 세션 발급\n",
    });

    const opened = openCard("auth-login 제목");
    fireEvent.click(within(opened).getByRole("button", { name: /세션 발급/ }));
    const drawer = await screen.findByRole("dialog", { name: "issues/01-x.md" });

    // 🔴 ESC 로 닫지 않는다 — 카드 대화상자도 같은 키를 듣고 있어, 둘 다 열린 채로 ESC 를
    // 누르면 어느 쪽이 먼저 닫혀야 하는지가 애매해진다. 드로어 자신의 닫기 단추로 확인한다.
    fireEvent.click(within(drawer).getByRole("button", { name: "닫기" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "issues/01-x.md" })).toBeNull());
    // 카드 대화상자는 별개의 상태라 살아 있다 — 티켓 줄이 다시 보인다.
    expect(screen.getByText("세션 발급")).toBeInTheDocument();
  });
});
