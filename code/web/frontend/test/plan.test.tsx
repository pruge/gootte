import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Feature, PlanBoardResponse, PlanCard } from "@gootte/contract";
import { PlanView } from "../src/components/plan/PlanView";
import { qk } from "../src/lib/query";

/** 서버가 이미 다섯 칸으로 갈라 보낸 값 — 화면은 다시 가르지 않는다(spec §판정 자리는 하나뿐). */
function feature(slug: string, tickets: [string, string][] = []): Feature {
  return {
    slug,
    title: `${slug} — 제목`,
    status: "pending",
    sourceStatus: "draft",
    statusKnown: true,
    docs: [{ kind: "file", name: "spec.md", path: "spec.md" }],
    tickets: tickets.map(([num, title]) => ({
      num,
      slug: `${num}-x`,
      title,
      status: "pending",
      sourceStatus: "draft",
      statusKnown: true,
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

/** 카드는 기본 접혀 있다(캡틴 결정) — 티켓 줄을 보려면 머리글을 눌러 편다. */
const openCard = (title: string) => {
  const card = screen.getByRole("article", { name: title });
  fireEvent.click(within(card).getByRole("button", { expanded: false }));
  return card;
};

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

  it("🔴 카드는 기본 접혀 있다 — 티켓 줄은 안 보이고 티켓 수는 머리에 남는다(캡틴 결정)", () => {
    renderBoard({
      ...EMPTY_BOARD,
      waiting: [card(feature("auth-login", [["01", "세션 발급"], ["02", "로그인 화면"]]))],
    });
    const card1 = screen.getByRole("article", { name: "auth-login 제목" });
    expect(within(card1).getByRole("button", { expanded: false })).toBeInTheDocument();
    expect(within(card1).queryByText("세션 발급")).toBeNull();
    // 접혀 있어도 카드가 제 크기를 말한다.
    expect(within(card1).getByText("티켓 2")).toBeInTheDocument();
  });

  it("머리글을 누르면 열려 티켓들이 줄로 보인다 — 문서에서 온 값이다(INV-5)", () => {
    renderBoard({
      ...EMPTY_BOARD,
      waiting: [card(feature("auth-login", [["01", "세션 발급"], ["02", "로그인 화면"]]))],
    });
    const card1 = openCard("auth-login 제목");
    expect(within(card1).getByRole("button", { expanded: true })).toBeInTheDocument();
    expect(within(card1).getByText("세션 발급")).toBeInTheDocument();
    expect(within(card1).getByText("로그인 화면")).toBeInTheDocument();
  });

  it("다시 누르면 도로 접힌다 — 접힘은 화면의 상태일 뿐 저장되지 않는다", () => {
    renderBoard({ ...EMPTY_BOARD, waiting: [card(feature("auth-login", [["01", "세션 발급"]]))] });
    const card1 = openCard("auth-login 제목");
    fireEvent.click(within(card1).getByRole("button", { expanded: true }));
    expect(within(card1).queryByText("세션 발급")).toBeNull();
  });

  it("한 카드를 열어도 옆 카드는 접힌 채로 남는다", () => {
    renderBoard({
      ...EMPTY_BOARD,
      waiting: [card(feature("a", [["01", "가 티켓"]])), card(feature("b", [["01", "나 티켓"]]))],
    });
    openCard("a 제목");
    expect(screen.getByText("가 티켓")).toBeInTheDocument();
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
    expect(within(done).getByText("2026-08-12T09:30:00+09:00")).toBeInTheDocument();
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
    const only = openCard("no-tickets 제목");
    expect(within(only).getByText("티켓이 없습니다.")).toBeInTheDocument();
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
    fireEvent.click(within(cardOf("a 제목")).getByRole("button", { expanded: false }), {
      metaKey: true,
    });
    fireEvent.click(within(cardOf("b 제목")).getByRole("button", { expanded: false }), {
      metaKey: true,
    });
    // 고른 것은 눈에 보인다 — 몇 장인지 화면이 말한다.
    expect(screen.getByText(/대기 2장 고름/)).toBeInTheDocument();

    clickIcon("a 제목", /다른 칸으로 보내기/);
    fireEvent.click(screen.getByRole("button", { name: "작업 대상" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sent().features).toEqual(["a", "b"]);
  });

  it("⌘+클릭은 카드를 펼치지 않는다 — 고르는 것과 여는 것이 섞이지 않는다", () => {
    renderBoard({ ...EMPTY_BOARD, waiting: [card(feature("a", [["01", "티켓 하나"]]))] });
    fireEvent.click(within(cardOf("a 제목")).getByRole("button", { expanded: false }), {
      metaKey: true,
    });
    expect(screen.queryByText("티켓 하나")).toBeNull();
  });

  it("다른 칸의 카드를 고르면 묶음이 그 칸으로 옮겨간다 — 안 보이는 카드가 딸려 가지 않게", () => {
    renderBoard({
      ...EMPTY_BOARD,
      active: [card(feature("up"), 0)],
      waiting: [card(feature("down"))],
    });
    const pick = (name: string) =>
      fireEvent.click(within(cardOf(name)).getByRole("button", { expanded: false }), {
        metaKey: true,
      });
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
