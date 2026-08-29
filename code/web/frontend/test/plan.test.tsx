import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Feature, FeatureTicket, PlanBoardResponse, PlanCard } from "@gootte/contract";
import { PlanView } from "../src/components/plan/PlanView";
import { qk } from "../src/lib/query";

/**
 * 티켓 한 장 — `[번호, 제목]` 이면 미완이고, 상태와 완료일까지 주면 문서가 그렇게 말하는 것이다.
 * 🔴 상자 값은 여기 없다 — 상자는 이 상태에서 **계산된다**(04, `ticketBoxState`).
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

const card = (
  f: Feature,
  seq: number | null = null,
  closedAt: string | null = null,
  steps?: Record<string, number>,
): PlanCard => ({
  feature: f,
  seq,
  closedAt,
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
        <PlanView project="alpha" />
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

  /**
   * 🔴 회귀 — `tickets/` 신관례(T04)만 쓰는 기능은 `feature.tickets`(구관례)가 비어 있다.
   * `BoardCard`·`CardDialog` 가 `feature.tickets` 만 세면 이런 기능은 카드가 "티켓 0", 대화상자는
   * "티켓이 없습니다" 를 보여준다 — 실제로는 `newTickets` 에 미완 티켓이 있는데도(캡틴 보고,
   * 2026-08-25). `FeatureCard`(features 탭)와 같은 결함이 plan 탭에도 있었다.
   */
  it("issues/ 없이 tickets/ 만 있는 기능도 카드 머리·대화상자에서 티켓 수·목록이 잡힌다", () => {
    const newTicket: FeatureTicket = {
      num: "01",
      slug: "T01",
      path: "tickets/T01.md",
      title: "신관례 티켓",
      status: "pending",
      sourceStatus: null,
      statusKnown: false,
      blockedBy: [],
      unreadableBlockedBy: [],
      waitingOn: [],
      startable: true,
      workedBy: [],
      needsCaptainEye: false,
      docConvention: "tickets",
      joinFailed: false,
    };
    const f: Feature = { ...feature("new-convention"), tickets: [], newTickets: [newTicket] };
    renderBoard({ ...EMPTY_BOARD, waiting: [card(f)] });
    const card1 = screen.getByRole("article", { name: "new-convention 제목" });
    expect(within(card1).getByText("티켓 1")).toBeInTheDocument();
    const opened = openCard("new-convention 제목");
    expect(within(opened).getByText("티켓 1")).toBeInTheDocument();
    expect(within(opened).getByText("신관례 티켓")).toBeInTheDocument();
    expect(within(opened).queryByText("티켓이 없습니다.")).toBeNull();
  });

  /**
   * 🔴 회귀 — `CardDialog` 의 상태 배지가 `features` 탭 `TicketRow` 와 다른 판정을 썼다. tickets/
   * 신관례는 파일에 상태가 없어(SoT = Time: 줄) `t.statusKnown` 이 항상 false 인데, `CardDialog` 는
   * 그 값만 보고 "정규 아홉 값이 아닙니다" 경고 배지("상태 줄 없음")를 띄웠다 — Time: 줄에
   * finishedAt 이 있어도 무시됐다(T04). `TicketRow` 와 같이 `docConvention` 을 먼저 보게 고쳤다.
   */
  it("tickets/ 신관례가 Time: 줄로 완료면 대화상자도 배지를 보여준다 — 경고 배지가 아니다", () => {
    const joined: FeatureTicket = {
      num: "02",
      slug: "T02",
      path: "tickets/T02.md",
      title: "조인된 신관례 티켓",
      status: "done",
      sourceStatus: null,
      statusKnown: false,
      completedAt: "2026-08-25",
      blockedBy: [],
      unreadableBlockedBy: [],
      waitingOn: [],
      startable: true,
      workedBy: [],
      needsCaptainEye: false,
      docConvention: "tickets",
      joinFailed: false,
      finishedAt: "2026-08-25T10:00:00+09:00",
    };
    const f: Feature = { ...feature("joined-convention"), tickets: [], newTickets: [joined] };
    renderBoard({ ...EMPTY_BOARD, waiting: [card(f)] });
    const opened = openCard("joined-convention 제목");
    expect(within(opened).getByText("완료")).toBeInTheDocument();
    expect(within(opened).queryByText("상태 줄 없음")).toBeNull();
  });

  it("tickets/ 신관례가 미조인이면(백로그에 없음) 배지 없이 조용하다 — 경고로 보이지 않는다", () => {
    const unjoined: FeatureTicket = {
      num: "01",
      slug: "T01",
      path: "tickets/T01.md",
      title: "미조인 신관례 티켓",
      status: "pending",
      sourceStatus: null,
      statusKnown: false,
      blockedBy: [],
      unreadableBlockedBy: [],
      waitingOn: [],
      startable: true,
      workedBy: [],
      needsCaptainEye: false,
      docConvention: "tickets",
      joinFailed: true,
    };
    const f: Feature = { ...feature("unjoined-convention"), tickets: [], newTickets: [unjoined] };
    renderBoard({ ...EMPTY_BOARD, waiting: [card(f)] });
    const opened = openCard("unjoined-convention 제목");
    expect(within(opened).queryByText("상태 줄 없음")).toBeNull();
    expect(within(opened).queryByRole("status", { name: /정규 아홉 값이 아닙니다/ })).toBeNull();
  });

  it("🔴 안 읽은 티켓 줄에 표시가 뜬다 — features 탭과 같은 표시(unread-tickets-show-themselves/02)", () => {
    const f = feature("auth-login", [["01", "안 읽은 것"], ["02", "읽은 것"]]);
    const unreadFeature: Feature = {
      ...f,
      tickets: f.tickets.map((t) => ({ ...t, unread: t.num === "01" })),
    };
    renderBoard({ ...EMPTY_BOARD, waiting: [card(unreadFeature)] });
    const opened = openCard("auth-login 제목");
    const unreadRow = within(opened).getByText("안 읽은 것").closest("button") as HTMLElement;
    const readRow = within(opened).getByText("읽은 것").closest("button") as HTMLElement;
    expect(within(unreadRow).getByText("안 읽음")).toBeInTheDocument();
    expect(within(readRow).queryByText("안 읽음")).toBeNull();
  });

  /**
   * T02(a-ticket-tells-how-long-it-took) — 걸린 시간 어림 문구가 기존 hover 문구에 이어 붙는다.
   * 값은 core `elapsedPhrase` 가 만들고 여기는 옮겨 싣기만 한다(INV-1) — `process` 탭
   * `ProcessView` 와 **같은 문구**를 보여야 한다(process.test.tsx 의 같은 이름 시험과 짝).
   */
  it("🔴 걸린 시간 문구가 기존 hover 문구 뒤에 이어 붙는다 — 기존 문구는 살아 있다", () => {
    const f = feature("a", [["01", "끝난 것", "done", "2026-08-01"]]);
    const withElapsed: Feature = { ...f, tickets: f.tickets.map((t) => ({ ...t, elapsed: "약 14분" })) };
    renderBoard({ ...EMPTY_BOARD, waiting: [card(withElapsed)] });
    const opened = openCard("a 제목");
    const row = within(opened).getByText("끝난 것").closest("button") as HTMLElement;
    const glyph = within(row).getByText("[x]");
    expect(glyph.getAttribute("title")).toBe("문서가 완료라고 말한다\n약 14분");
  });

  it("걸린 시간 기록이 없으면 hover 문구에 아무것도 덧붙지 않는다(INV-4)", () => {
    const f = feature("a", [["01", "끝난 것", "done", "2026-08-01"]]);
    renderBoard({ ...EMPTY_BOARD, waiting: [card(f)] });
    const opened = openCard("a 제목");
    const row = within(opened).getByText("끝난 것").closest("button") as HTMLElement;
    const glyph = within(row).getByText("[x]");
    expect(glyph.getAttribute("title")).toBe("문서가 완료라고 말한다");
  });

  it("진행 중인 티켓의 걸린 시간 문구는 '진행 중' 이 그대로 실려 온다", () => {
    const f = feature("a", [["01", "붙들린 것", "in_progress"]]);
    const withElapsed: Feature = { ...f, tickets: f.tickets.map((t) => ({ ...t, elapsed: "약 5분 진행 중" })) };
    renderBoard({ ...EMPTY_BOARD, waiting: [card(withElapsed)] });
    const opened = openCard("a 제목");
    const row = within(opened).getByText("붙들린 것").closest("button") as HTMLElement;
    const glyph = within(row).getByText("[ ]");
    expect(glyph.getAttribute("title")).toBe("아직 완료가 아니다\n약 5분 진행 중");
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
 * 처리중 파랑(status-colors-tell-apart/02)과 안 읽음 초록(unread-tickets-show-themselves/03)이
 * 계획 탭 카드 대화상자에서 함께 선다. 🔴 검사가 붙드는 것은 **표시 문구가 있나 없나**뿐이다 —
 * 색값은 캡틴이 조정할 수 있으므로 여기서 잠그지 않는다(INV-C2·INV-U2).
 */
describe("PlanView — 처리중과 안 읽음이 카드 대화상자에서 함께 선다(status-colors-tell-apart/02)", () => {
  it("🔴 네 조합이 전부 옳다 — 안읽음×처리중 / 안읽음×아님 / 읽음×처리중 / 읽음×아님", () => {
    const f = feature("combo", [
      ["01", "안읽음 처리중", "in_progress"],
      ["02", "안읽음 아님", "pending"],
      ["03", "읽음 처리중", "in_progress"],
      ["04", "읽음 아님", "pending"],
    ]);
    const combo: Feature = {
      ...f,
      tickets: f.tickets.map((t) => ({ ...t, unread: t.num === "01" || t.num === "02" })),
      hasUnreadTicket: true,
    };
    renderBoard({ ...EMPTY_BOARD, active: [card(combo, 0)] });
    const opened = openCard("combo 제목");
    const rowOf = (title: string) => within(opened).getByText(title).closest("button") as HTMLElement;

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
});

/**
 * 안 읽은 티켓이 있는 기능은 계획 탭 카드 머리도 초록이 된다(unread-tickets-show-themselves/03) —
 * `features` 탭 머리글과 같은 판정(`feature.hasUnreadTicket`)을 그대로 쓴다.
 */
describe("PlanView — 카드 머리가 어디에 서 있든 안 읽음을 말한다(unread-tickets-show-themselves/03)", () => {
  it("카드를 열지 않아도 머리에 표시가 뜬다", () => {
    const f = feature("auth-login", [["01", "안 읽은 것"]]);
    const unreadFeature: Feature = { ...f, hasUnreadTicket: true };
    renderBoard({ ...EMPTY_BOARD, waiting: [card(unreadFeature)] });
    const cardEl = screen.getByRole("article", { name: "auth-login 제목" });
    expect(within(cardEl).getByText("안 읽음")).toBeInTheDocument();
  });

  it("🔴 다 읽으면(hasUnreadTicket=false) 표시가 풀린다 — 판이 다시 받아온 값을 그대로 그린다", async () => {
    const { qc } = renderBoard({
      ...EMPTY_BOARD,
      waiting: [card({ ...feature("auth-login", [["01", "이제 읽음"]]), hasUnreadTicket: true })],
    });
    expect(
      within(screen.getByRole("article", { name: "auth-login 제목" })).getByText("안 읽음"),
    ).toBeInTheDocument();

    // 실시간 배선(WS → plan 쿼리 invalidate)이 가져오는 것과 같은 새 판을 앉힌다(plan.test.tsx 관례).
    qc.setQueryData(qk.plan("alpha"), {
      ...EMPTY_BOARD,
      waiting: [card({ ...feature("auth-login", [["01", "이제 읽음"]]), hasUnreadTicket: false })],
    });
    await waitFor(() =>
      expect(
        within(screen.getByRole("article", { name: "auth-login 제목" })).queryByText("안 읽음"),
      ).toBeNull(),
    );
  });

  it("🔴 완료 칸의 카드에도 그대로 뜬다 — 캡틴이 손으로 닫은 카드에서도(캡틴이 이름 대신 경우)", () => {
    const f = feature("shipped", [["01", "끝난 것", "done", "2026-08-01"]]);
    const doneWithUnread: Feature = { ...f, hasUnreadTicket: true };
    renderBoard({ ...EMPTY_BOARD, done: [card(doneWithUnread, 0, "2026-08-12 09:00")] });
    openTab("완료");
    const cardEl = screen.getByRole("article", { name: "shipped 제목" });
    expect(within(cardEl).getByText("안 읽음")).toBeInTheDocument();
  });

  it("안 읽은 티켓이 없으면 카드 머리에 표시가 없다", () => {
    const f = feature("clean", [["01", "읽은 것"]]);
    renderBoard({ ...EMPTY_BOARD, waiting: [card({ ...f, hasUnreadTicket: false })] });
    const cardEl = screen.getByRole("article", { name: "clean 제목" });
    expect(within(cardEl).queryByText("안 읽음")).toBeNull();
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

  it("문서 아이콘은 plan 탭에 머문 채 드로어를 그 자리에서 연다 — features 탭으로 건너가지 않는다", async () => {
    const { qc } = renderBoard({ ...EMPTY_BOARD, waiting: [card(feature("auth-login"))] });
    qc.setQueryData(qk.featureDoc("alpha", "auth-login", "spec.md"), {
      path: "spec.md",
      content: "# auth-login\n",
    });

    clickIcon("auth-login 제목", /문서 열기/);

    const drawer = await screen.findByRole("dialog", { name: "spec.md" });
    expect(within(drawer).getByRole("heading", { name: "auth-login" })).toBeInTheDocument();
    // 🔴 카드는 그대로 있다 — 탭이 바뀌었다면 이 카드는 화면에서 사라졌을 것이다.
    expect(screen.getByRole("article", { name: "auth-login 제목" })).toBeInTheDocument();
  });

  it("문서가 하나도 없는 기능은 아무것도 열지 않는다 — 없는 주소를 지어내지 않는다", () => {
    const bare = { ...feature("no-docs"), docs: [] };
    renderBoard({ ...EMPTY_BOARD, waiting: [card(bare)] });
    clickIcon("no-docs 제목", /문서 열기/);
    expect(screen.queryByRole("dialog")).toBeNull();
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

  it("🔴 폐기 티켓은 [-] 상자다(plan-board/12 뒤집힘) — 끝난 것([x])과 모양이 갈린다", () => {
    renderBoard({
      ...EMPTY_BOARD,
      active: [card(feature("wf", [["01", "안 할 것", "dropped"]]), 0)],
    });
    const c = openCard("wf 제목");
    expect(boxesIn(c)).toEqual(["[-]"]);
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

  it("🔴 06 — 저절로 닫힌 카드(closedAt 없음)는 문서가 말하는 완료 시각 하나를 보여준다", () => {
    renderBoard({
      ...EMPTY_BOARD,
      done: [
        card(
          feature("auto-closed", [
            ["01", "먼저", "done", "2026-08-02"],
            ["02", "나중", "done", "2026-08-09 14:30"],
          ]),
          0,
          null, // 저절로 닫혔다 — closed_at 을 찍지 않는다(06)
        ),
      ],
    });
    openTab("완료");
    const c = screen.getByRole("article", { name: "auto-closed 제목" });
    expect(within(c).getByText("닫힘 2026-08-09 14:30")).toBeInTheDocument();
  });

  it("🔴 06 — 캡틴이 손으로 닫은 카드는 저장된 닫힘 시각을 그대로 보여준다, 문서 날짜를 참고하지 않는다", () => {
    renderBoard({
      ...EMPTY_BOARD,
      done: [
        card(feature("manual-close", [["01", "하나", "done", "2026-08-02"]]), 0, "2026-08-12 17:40"),
      ],
    });
    openTab("완료");
    const c = screen.getByRole("article", { name: "manual-close 제목" });
    expect(within(c).getByText("닫힘 2026-08-12 17:40")).toBeInTheDocument();
    expect(within(c).queryByText(/2026-08-02/)).toBeNull();
  });

  it("🔴 06 — 저절로 닫혔는데 문서에 완료 시각이 없으면 닫힘 줄을 보이지 않는다, 지어내지 않는다", () => {
    renderBoard({
      ...EMPTY_BOARD,
      done: [card(feature("bare", [["01", "하나", "done"]]), 0, null)],
    });
    openTab("완료");
    const c = screen.getByRole("article", { name: "bare 제목" });
    expect(within(c).queryByText(/닫힘/)).toBeNull();
  });

  it("닫히지 않은 카드에는 시각 줄이 없다 — 없는 값을 자리로 만들지 않는다", () => {
    renderBoard({ ...EMPTY_BOARD, active: [card(feature("open", [["01", "하나"]]), 0)] });
    const c = screen.getByRole("article", { name: "open 제목" });
    expect(within(c).queryByText(/닫힘/)).toBeNull();
  });
});

/**
 * 단계를 매기고 빈 단계는 당겨진다. `next` 는 CLI 몫이라 여기서 재지 않는다(plan-board/05).
 * 화면이 재는 것은 딱 하나 — **서버가 이미 계산해 보낸 `card.steps` 를 그대로 보여주는가**다.
 * 당김 계산 자체는 `core/src/plan/step.test.ts` 가 덮는다(spec §판정 자리는 하나뿐).
 */
describe("PlanView — 카드 대화상자의 단계 표시(plan-board/05)", () => {
  it("표시 단계 순으로 티켓이 줄 선다", () => {
    renderBoard({
      ...EMPTY_BOARD,
      active: [
        card(
          feature("ordered", [["01", "나중"], ["02", "먼저"]]),
          0,
          null,
          { "02-x": 1, "01-x": 2 },
        ),
      ],
    });
    const opened = openCard("ordered 제목");
    const titles = within(opened)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(titles[0]).toContain("먼저");
    expect(titles[1]).toContain("나중");
  });

  it("단계 숫자를 그대로 보여준다", () => {
    renderBoard({
      ...EMPTY_BOARD,
      active: [card(feature("step1", [["01", "하나"]]), 0, null, { "01-x": 1 })],
    });
    const opened = openCard("step1 제목");
    expect(within(opened).getByText("1단계")).toBeInTheDocument();
  });

  it("🔴 9999 단계는 숫자 대신 — 로 보여준다 — 아직 순서를 안 정했다는 뜻이다", () => {
    renderBoard({
      ...EMPTY_BOARD,
      active: [card(feature("unranked", [["01", "하나"]]), 0, null, { "01-x": 9999 })],
    });
    const opened = openCard("unranked 제목");
    expect(within(opened).getByText("—단계")).toBeInTheDocument();
  });

  it("작업 대상 밖 카드는 단계 값이 없다 — 문서 순서 그대로다", () => {
    renderBoard({
      ...EMPTY_BOARD,
      waiting: [card(feature("idle", [["01", "가"], ["02", "나"]]))],
    });
    const opened = openCard("idle 제목");
    const titles = within(opened)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(titles[0]).toContain("가");
    expect(titles[1]).toContain("나");
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

  /**
   * 🔴 회귀 — `ticketDocPath()` 가 슬러그에서 `issues/<slug>.md` 를 지어내고 있었다(캡틴 결정
   * 2026-08-12 당시엔 유일한 관례였다). `tickets/T<NN>.md` 신관례(T04) 도입 후에는 그 재조립이
   * 실제 경로와 어긋나 티켓을 눌러도 문서가 안 열렸다(캡틴 보고, 2026-08-25) — 지금은 서버가 이미
   * 준 `ticket.path` 를 그대로 쓴다(재조립하지 않는다, INV-4).
   */
  it("tickets/ 신관례 티켓 줄을 누르면 그 티켓의 tickets/T<NN>.md 가 드로어로 뜬다", async () => {
    const newTicket: FeatureTicket = {
      num: "01",
      slug: "T01",
      path: "tickets/T01.md",
      title: "신관례 티켓",
      status: "pending",
      sourceStatus: null,
      statusKnown: false,
      blockedBy: [],
      unreadableBlockedBy: [],
      waitingOn: [],
      startable: true,
      workedBy: [],
      needsCaptainEye: false,
      docConvention: "tickets",
      joinFailed: false,
    };
    const f: Feature = { ...feature("new-convention"), tickets: [], newTickets: [newTicket] };
    const { qc } = renderBoard({ ...EMPTY_BOARD, waiting: [card(f)] });
    qc.setQueryData(qk.featureDoc("alpha", "new-convention", "tickets/T01.md"), {
      path: "tickets/T01.md",
      content: "# T01 — 신관례 티켓\n",
    });

    const opened = openCard("new-convention 제목");
    fireEvent.click(within(opened).getByRole("button", { name: /신관례 티켓/ }));

    const drawer = await screen.findByRole("dialog", { name: "tickets/T01.md" });
    expect(within(drawer).getByRole("heading", { name: "T01 — 신관례 티켓" })).toBeInTheDocument();
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
