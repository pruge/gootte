import { render, screen, within, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect } from "vitest";
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
    docs: [],
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

function renderBoard(board: PlanBoardResponse) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(qk.plan("alpha"), board);
  return render(
    <QueryClientProvider client={qc}>
      <PlanView project="alpha" />
    </QueryClientProvider>,
  );
}

/** 아래 칸의 탭 하나를 눌러 그 칸을 연다. */
const openTab = (label: string) => fireEvent.click(screen.getByRole("tab", { name: new RegExp(label) }));

describe("PlanView — 다섯 자리 판(plan-board/02)", () => {
  it("다섯 칸이 그려진다 — 위 작업 대상 하나, 아래 네 탭", () => {
    renderBoard(EMPTY_BOARD);
    expect(screen.getByRole("heading", { name: "작업 대상" })).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["대기0", "예약0", "폐기0", "완료0"]);
  });

  it("🔴 자리 행이 없는 기능은 대기 칸에 뜬다 — 등록이라는 절차가 없다(INV-B1)", () => {
    renderBoard({ ...EMPTY_BOARD, waiting: [card(feature("auth-login"))] });
    expect(screen.getByRole("heading", { name: "auth-login — 제목" })).toBeInTheDocument();
  });

  it("카드 안에 그 기능의 티켓들이 줄로 보인다 — 문서에서 온 값이다(INV-5)", () => {
    renderBoard({
      ...EMPTY_BOARD,
      waiting: [card(feature("auth-login", [["01", "세션 발급"], ["02", "로그인 화면"]]))],
    });
    const card1 = screen.getByRole("article", { name: "auth-login — 제목" });
    expect(within(card1).getByText("세션 발급")).toBeInTheDocument();
    expect(within(card1).getByText("로그인 화면")).toBeInTheDocument();
    expect(within(card1).getByText("티켓 2")).toBeInTheDocument();
  });

  it("작업 대상 칸에는 그 칸의 카드만 보인다", () => {
    renderBoard({
      ...EMPTY_BOARD,
      active: [card(feature("moving"), 0)],
      waiting: [card(feature("idle"))],
    });
    const active = screen.getByRole("region", { name: "작업 대상" });
    expect(within(active).getByRole("heading", { name: "moving — 제목" })).toBeInTheDocument();
    expect(within(active).queryByRole("heading", { name: "idle — 제목" })).toBeNull();
  });

  it("아래 네 칸은 탭으로 전환된다 — 예약·폐기·완료가 각자 자기 카드를 보여준다", () => {
    renderBoard({
      ...EMPTY_BOARD,
      reserved: [card(feature("later"))],
      discarded: [card(feature("scrapped"))],
      done: [card(feature("shipped"), 1, "2026-08-12T09:30:00+09:00")],
    });
    // 처음 열려 있는 것은 대기 — 비어 있다.
    expect(screen.queryByRole("heading", { name: "later — 제목" })).toBeNull();

    openTab("예약");
    expect(screen.getByRole("heading", { name: "later — 제목" })).toBeInTheDocument();

    openTab("폐기");
    expect(screen.getByRole("heading", { name: "scrapped — 제목" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "later — 제목" })).toBeNull();

    openTab("완료");
    const done = screen.getByRole("article", { name: "shipped — 제목" });
    // 닫힌 시각은 문서에 없는 값이라 계획 DB 가 갖는다(INV-5).
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

  it("티켓이 없는 기능도 카드로 뜬다 — 감추면 화면이 거짓말한다", () => {
    renderBoard({ ...EMPTY_BOARD, waiting: [card(feature("no-tickets"))] });
    const only = screen.getByRole("article", { name: "no-tickets — 제목" });
    expect(within(only).getByText("티켓이 없습니다.")).toBeInTheDocument();
  });

  it("빈 판도 다섯 칸이 그대로 서 있다 — 칸이 사라지지 않는다", () => {
    renderBoard(EMPTY_BOARD);
    expect(screen.getByText("작업 대상이 비어 있습니다.")).toBeInTheDocument();
    expect(screen.getByText("docs/features/ 아래 기능이 없습니다.")).toBeInTheDocument();
  });
});
