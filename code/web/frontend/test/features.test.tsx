import { useState } from "react";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import type { FeaturesResponse, FeatureTicket, PlanBoardResponse, PlanCard } from "@gootte/contract";

// 구관례 `issues/` 폴더 — issues 칸은 이 폴더가 실재할 때만 그려진다(FeatureTree 의 `{issues && ...}`, INV-4).
const ISSUES_DIR = { kind: "dir" as const, name: "issues", path: "issues", children: [] };
import { FeaturesView } from "../src/components/features/FeaturesView";
import { qk } from "../src/lib/query";

// 서버가 계산까지 끝낸 값(startable·waitingOn·처리중) — 화면은 재계산하지 않는다(INV-1).
const NO_WORK: FeaturesResponse["inProgress"] = {
  root: "/tmp/th",
  rootExists: true,
  copies: 0,
  working: 0,
  tickets: 0,
  unknown: [],
  unreadable: [],
  unclaimed: [],
};
const DATA: FeaturesResponse = {
  project: "alpha",
  inProgress: { ...NO_WORK, copies: 2, working: 1, tickets: 1 },
  features: [
    {
      slug: "auth-login",
      title: "auth-login — 로그인",
      status: "pending",
      sourceStatus: "ready-for-agent",
      statusKnown: true,
      docs: [ISSUES_DIR],
      tickets: [
        {
          num: "01",
          slug: "01-session",
          path: "issues/01-session.md",
          title: "세션 발급",
          status: "done",
          sourceStatus: "resolved",
          statusKnown: true,
          completedAt: "2026-08-08",
          blockedBy: [],
          unreadableBlockedBy: [],
          waitingOn: [],
          startable: true,
          needsCaptainEye: false,
        },
        {
          num: "02",
          slug: "02-screen",
          path: "issues/02-screen.md",
          title: "로그인 화면",
          status: "pending",
          sourceStatus: "ready-for-agent",
          statusKnown: true,
          blockedBy: ["01"],
          unreadableBlockedBy: [],
          waitingOn: [],
          startable: true,
          needsCaptainEye: false,
        },
        {
          num: "03",
          slug: "03-social",
          path: "issues/03-social.md",
          title: "소셜 로그인",
          status: "pending",
          sourceStatus: "needs-info",
          statusKnown: true,
          blockedBy: ["02"],
          unreadableBlockedBy: [],
          waitingOn: ["02"],
          startable: false,
          needsCaptainEye: false,
        },
        {
          num: "04",
          slug: "04-mystery",
          path: "issues/04-mystery.md",
          title: "정체불명",
          status: "pending",
          sourceStatus: "진행중",
          statusKnown: false,
          blockedBy: [],
          unreadableBlockedBy: [],
          waitingOn: [],
          startable: true,
          needsCaptainEye: false,
        },
        {
          // 처리중 — 문서가 아니라 격리 사본 관측이 준 값이다. 원문 상태는 그대로 남는다.
          num: "05",
          slug: "05-oauth",
          path: "issues/05-oauth.md",
          title: "OAuth 교환",
          status: "in_progress",
          sourceStatus: "ready-for-agent",
          statusKnown: true,
          blockedBy: [],
          unreadableBlockedBy: [],
          waitingOn: [],
          startable: true,
          needsCaptainEye: false,
        },
      ],
    },
  ],
};

/** view 상태를 실제로 URL 훅처럼 들고 있는 최소 하네스 — DocDrawer/열림 상태 왕복을 실제로 검증한다. */
function Harness({
  project,
  initialView = null,
}: {
  project: string;
  initialView?: string | null;
}) {
  const [view, setView] = useState<string | null>(initialView);
  return (
    <FeaturesView project={project} view={view} onView={setView} />
  );
}

function renderView(
  data: FeaturesResponse,
  initialView: string | null = null,
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(qk.features(data.project), data);
  return render(
    <QueryClientProvider client={qc}>
      <Harness project={data.project} initialView={initialView} />
    </QueryClientProvider>,
  );
}

/** 문서 드로어가 열린 채 시작 — 검색 ESC 와 문서 ESC 의 우선순위를 검증한다(티켓 03). */
function renderViewWithOpenDoc(data: FeaturesResponse, path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(qk.features(data.project), data);
  qc.setQueryData(qk.featureDoc(data.project, "auth-login", path), {
    path,
    content: "# auth-login\n",
  });
  return render(
    <QueryClientProvider client={qc}>
      <Harness project={data.project} initialView={`auth-login/${path}`} />
    </QueryClientProvider>,
  );
}
const renderFeatures = () => renderView(DATA);

/** 기능 카드 머리글(제목이 든 `<h2>`)의 조상 `<button>` 을 눌러 연다. */
function openCard(title: string): void {
  const button = screen.getByRole("heading", { name: title }).closest("button")!;
  fireEvent.click(button);
}

function manyTickets(n: number): FeatureTicket[] {
  return Array.from({ length: n }, (_, i) => ({
    num: String(i + 1).padStart(2, "0"),
    slug: `${String(i + 1).padStart(2, "0")}-t`,
    path: `issues/${String(i + 1).padStart(2, "0")}-t.md`,
    title: `티켓 ${i + 1}`,
    status: "pending",
    sourceStatus: "ready-for-agent",
    statusKnown: true,
    blockedBy: [],
    unreadableBlockedBy: [],
    waitingOn: [],
    startable: true,
    needsCaptainEye: false,
  }));
}

describe("FeaturesView — 기능 카드는 기본 접힘, 눌러야 연다(티켓 01 §설계 2)", () => {
  it("기본 상태 — 머리글만 보이고 티켓은 안 보인다", () => {
    renderFeatures();
    // 🔴 표제가 `<이름> — <설명>` 꼴이면 이름이 두 번 뜨지 않는다 — h2 는 겹친 앞부분을 뗀
    // 설명만, 슬러그는 옆 배지가 이미 말한다(같은 규칙을 쓰는 `plan` 탭 카드와 동형).
    expect(screen.getByRole("heading", { name: "로그인" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "auth-login — 로그인" })).toBeNull();
    expect(screen.getByText("auth-login")).toBeInTheDocument();
    expect(screen.queryByText("세션 발급")).toBeNull();
    const button = screen.getByRole("heading", { name: "로그인" }).closest("button")!;
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("머리글을 누르면 열리고, check 가 이미 펼쳐진 채로 티켓이 다 보인다 — 한 번 더 누르지 않는다", () => {
    renderFeatures();
    openCard("로그인");
    const button = screen.getByRole("heading", { name: "로그인" }).closest("button")!;
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("세션 발급")).toBeInTheDocument();
    expect(screen.getByText("로그인 화면")).toBeInTheDocument();
    expect(screen.getByText("소셜 로그인")).toBeInTheDocument();
  });

  it("🔴 화면보다 긴 카드를 열어도 티켓이 전부 렌더된다 — 잘리거나 사라지지 않는다(F1 회귀)", () => {
    const data: FeaturesResponse = {
      project: "alpha",
      inProgress: NO_WORK,
      features: [
        {
          slug: "big",
          title: "big — 많음",
          status: "pending",
          sourceStatus: "ready-for-agent",
          statusKnown: true,
          docs: [ISSUES_DIR],
          tickets: manyTickets(20),
        },
      ],
    };
    renderView(data);
    openCard("많음");
    for (let i = 1; i <= 20; i++) {
      expect(screen.getByText(`티켓 ${i}`)).toBeInTheDocument();
    }
    // 카드가 flex 부모 안에서 눌리지 않게 하는 클래스 — 없으면 F1 이 재현된다.
    const card = screen.getByRole("heading", { name: "많음" }).closest("section")!;
    expect(card.className).toContain("shrink-0");
  });

  it("선행이 남은 티켓은 대기 단계만 보이고(막힘 표시는 행에 노출 않음), 풀린 티켓은 착수 가능으로 보인다", () => {
    renderFeatures();
    openCard("로그인");
    const blocked = screen.getByText("소셜 로그인").closest("li")!;
    // 상태 배지 "대기" + StageCell "대기" 두 곳에 있음
    expect(within(blocked).getAllByText("대기").length).toBeGreaterThan(0);
    // 🔴 막힘 표시(→ 의존성)는 행에서 노출하지 않는다(사용자 결정 — blocked-by 숨김).
    expect(within(blocked).queryByText("→ 02")).not.toBeInTheDocument();
    const ready = screen.getByText("로그인 화면").closest("li")!;
    expect(within(ready).getByText("착수 가능")).toBeInTheDocument();
  });

  it("신/구관례 모두 계산된 상태 배지로 통일된다 — needs-info→대기, resolved→완료", () => {
    renderFeatures();
    openCard("로그인");
    // 구관례도 sourceStatus(needs-info/resolved) 대신 계산된 상태(pending/done) 배지 표시
    // 열린 기능 카드 안의 티켓 리스트(divide-y divide-border)에서 찾음
    const ticketList = screen.getByText("소셜 로그인").closest("ul")!;
    // 티켓 03(needs-info→pending)은 상태 배지 "대기" + StageCell "대기" 두 곳에 있음
    expect(within(ticketList).getAllByText("대기").length).toBeGreaterThan(0);
    expect(within(ticketList).getByText("완료")).toBeInTheDocument(); // resolved → done → "완료"
    expect(screen.getByText("2026-08-08")).toBeInTheDocument();
  });

  it("🔴 알 수 없는 상태의 티켓이 사라지지 않고, 무엇이 이상한지 드러난다", () => {
    renderFeatures();
    openCard("로그인");
    expect(screen.getByText("정체불명")).toBeInTheDocument();
    expect(screen.getByText(/알 수 없는 상태: 진행중/)).toBeInTheDocument();
  });

  it("지금 붙들려 있는 티켓에만 처리중 단계가 붙는다 — 어느 가지가 붙들었는지까지", () => {
    renderFeatures();
    openCard("로그인");
    const working = screen.getByText("OAuth 교환").closest("li")!;
    // 상태 배지 "처리중" + inProgress 텍스트 "처리중" 두 곳에 있음
    expect(within(working).getAllByText("처리중").length).toBeGreaterThan(0);
    // 🔴 작업 가지 이름은 행에 표시되지 않는다(read-path-redesign/T01 에서 값 자체가 삭제됐다).
    // 아무도 안 붙든 티켓에는 가지 이름이 안 붙는다.
    const idle = screen.getByText("로그인 화면").closest("li")!;
    expect(within(idle).queryByText("fm/alpha-oauth")).toBeNull();
  });
});

describe("FeaturesView — 머리글 네 수는 항상 뜬다(티켓 01 §설계 5 🔴)", () => {
  it("착수 가능·처리중이 0 이어도 칸이 사라지지 않는다", () => {
    const data: FeaturesResponse = {
      project: "alpha",
      inProgress: NO_WORK,
      features: [
        {
          slug: "idle",
          title: "idle — 쉬는 중",
          status: "pending",
          sourceStatus: "ready-for-agent",
          statusKnown: true,
          docs: [ISSUES_DIR],
          tickets: [
            {
              num: "01",
              slug: "01-a",
              path: "issues/01-a.md",
              title: "완료된 것 하나",
              status: "done",
              sourceStatus: "resolved",
              statusKnown: true,
              blockedBy: [],
              unreadableBlockedBy: [],
              waitingOn: [],
              startable: true,
              needsCaptainEye: false,
            },
          ],
        },
      ],
    };
    renderView(data);
    expect(screen.getByText(/착수 가능 0/)).toBeInTheDocument();
    expect(screen.getByText(/처리중 0/)).toBeInTheDocument();
  });

  it("처리중인 티켓이 있으면 머리글에 그 수가 색과 함께 보인다", () => {
    renderFeatures();
    expect(screen.getByText(/처리중 1/)).toBeInTheDocument();
  });
});


describe("FeaturesView — 이어지지 않은 작업(격리 사본 관측)", () => {
  it("🔴 티켓에 잇지 못한 작업중 사본이 화면에서 사라지지 않는다", () => {
    renderView({
      ...DATA,
      inProgress: {
        ...NO_WORK,
        copies: 2,
        working: 1,
        unknown: [{ slug: "alpha-abc123/2", branch: "fm/mystery", path: "/tmp/th/alpha-abc123/2" }],
      },
    });
    expect(screen.getByText(/티켓 미상 · 작업중 1/)).toBeInTheDocument();
    expect(screen.getByText("fm/mystery")).toBeInTheDocument();
    expect(screen.getByText("alpha-abc123/2")).toBeInTheDocument();
  });

  it("🔴 상태를 읽지 못한 사본도 유휴로 접히지 않고 화면에 남는다", () => {
    renderView({
      ...DATA,
      inProgress: {
        ...NO_WORK,
        copies: 1,
        unreadable: [{ slug: "alpha-abc123/3", path: "/tmp/th/alpha-abc123/3", reason: "git-failed" }],
      },
    });
    expect(screen.getByText(/상태를 읽지 못한 사본 1/)).toBeInTheDocument();
    expect(screen.getByText("git 이 답하지 않음")).toBeInTheDocument();
    expect(screen.getByText("alpha-abc123/3")).toBeInTheDocument();
  });

  it("🔴 claimed 인데 붙든 사본이 없는 티켓도 사라지지 않는다 — 처리중으로도 그리지 않는다", () => {
    renderView({
      ...DATA,
      inProgress: {
        ...NO_WORK,
        unclaimed: [{ feature: "auth-login", ticket: "02-x", title: "무언가" }],
      },
    });
    expect(screen.getByText(/임자 없이 남은 표시 1/)).toBeInTheDocument();
    expect(screen.getByText("auth-login/02-x")).toBeInTheDocument();
    expect(screen.getByText("무언가")).toBeInTheDocument();
  });

  it("기능이 없으면 빈 목록 안내", () => {
    renderView({ project: "alpha", features: [], inProgress: NO_WORK });
    expect(screen.getByText(/기능이 없습니다/)).toBeInTheDocument();
  });

  it("🔴 기능이 하나도 없어도 진행 중인 작업은 보인다 — 빈 화면이 거짓말하지 않는다", () => {
    renderView({
      project: "alpha",
      features: [],
      inProgress: {
        ...NO_WORK,
        copies: 1,
        working: 1,
        unknown: [{ slug: "alpha-abc123/1", branch: "fm/mystery", path: "/tmp/th/alpha-abc123/1" }],
      },
    });
    expect(screen.queryByText(/기능이 없습니다/)).toBeNull();
    expect(screen.getByText(/티켓 미상 · 작업중 1/)).toBeInTheDocument();
  });
});

// 두 번째 기능 — 검색이 "무엇이 남고 무엇이 사라졌나"를 가르는지 보려면 걸리는 것과
// 안 걸리는 것이 둘 다 있어야 한다. 티켓 제목만 검색어에 맞는 자리도 하나 둔다.
const SEARCH_DATA: FeaturesResponse = {
  ...DATA,
  features: [
    ...DATA.features,
    {
      slug: "billing",
      title: "billing — 결제",
      status: "pending",
      sourceStatus: "ready-for-agent",
      statusKnown: true,
      docs: [ISSUES_DIR],
      tickets: [
        {
          num: "01",
          slug: "01-charge",
          path: "issues/01-charge.md",
          title: "정기 결제",
          status: "pending",
          sourceStatus: "ready-for-agent",
          statusKnown: true,
          blockedBy: [],
          unreadableBlockedBy: [],
          waitingOn: [],
          startable: true,
          needsCaptainEye: false,
        },
      ],
    },
    // 신관례(tickets/) 전용 기능 — 검색이 newTickets 제목도 찾는다(실제 결함 회귀).
    {
      slug: "notify",
      title: "notify — 알림",
      status: "pending",
      sourceStatus: "ready-for-agent",
      statusKnown: true,
      docs: [
        {
          kind: "dir",
          name: "tickets",
          path: "tickets",
          children: [{ kind: "file", name: "T01-push.md", path: "tickets/T01-push.md" }],
        },
      ],
      tickets: [],
      newTickets: [
        {
          num: "01",
          slug: "T01-push",
          path: "tickets/T01-push.md",
          title: "푸시 발송",
          status: "pending",
          sourceStatus: null,
          statusKnown: true,
          blockedBy: [],
          unreadableBlockedBy: [],
          waitingOn: [],
          startable: true,
          needsCaptainEye: false,
        },
      ],
    },
    // 🔴 title 이 slug 를 포함하지 않는 기능 — 화면에 보이는 이름(slug 배지)으로도 검색돼야
    // 한다(2026-09-02 캡틴 보고: `plan-board` 를 검색어로 넣으면 안 잡혔다).
    {
      slug: "plan-board",
      title: "계획은 판 위에서 움직인다",
      status: "pending",
      sourceStatus: "ready-for-agent",
      statusKnown: true,
      docs: [],
      tickets: [],
    },
  ],
};

/** 검색 상자 — placeholder 로 찾는다(문구 그대로 `기능·티켓 검색`). */
function searchBox(): HTMLElement {
  return screen.getByPlaceholderText("기능·티켓 검색");
}

/**
 * 검색이 걸린 글자는 `<mark>` 칩으로 조각나 텍스트 노드가 갈린다 — 평범한 `getByText` 는
 * 조각난 글을 못 찾으므로 `textContent` 전체가 같은 원소를 직접 찾는다.
 */
function getByFullText(text: string): HTMLElement {
  return screen.getByText((_, el) => el?.textContent === text);
}

describe("FeaturesView — 검색 상자가 기능과 티켓을 찾아 준다(a-long-list-stays-usable/01)", () => {
  it("기능 이름으로 걸린다 — 대소문자 무관, 부분 일치. 안 걸린 카드는 사라진다", () => {
    renderView(SEARCH_DATA);
    fireEvent.change(searchBox(), { target: { value: "BILL" } });
    expect(screen.getByRole("heading", { name: "결제" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "로그인" })).toBeNull();
  });

  it("🔴 슬러그(slug)로도 걸린다 — title 이 slug 를 포함하지 않는 기능(실제 결함 2026-09-02)", () => {
    renderView(SEARCH_DATA);
    // plan-board 의 title 은 "계획은 판 위에서 움직인다" — slug 는 검색 범위에 들어가야 한다.
    fireEvent.change(searchBox(), { target: { value: "plan-board" } });
    expect(screen.getByRole("heading", { name: "계획은 판 위에서 움직인다" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "결제" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "로그인" })).toBeNull();
  });

  it("🔴 기능 이름(title)으로도 걸린다 — slug 가 아닌 표제 글자로도 찾는다", () => {
    renderView(SEARCH_DATA);
    // plan-board 의 title 은 "계획은 판 위에서 움직인다" — 표제의 글자로도 걸려야 한다.
    fireEvent.change(searchBox(), { target: { value: "움직인다" } });
    expect(screen.getByRole("heading", { name: "계획은 판 위에서 움직인다" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "결제" })).toBeNull();
  });

  it("걸린 자리가 노란 칩(<mark>)으로 뜬다 — 글자 크기는 그대로, 원문 대소문자 그대로 보인다", () => {
    renderView(SEARCH_DATA);
    fireEvent.change(searchBox(), { target: { value: "결제" } });
    const heading = screen.getByRole("heading", { name: "결제" });
    const mark = heading.querySelector("mark")!;
    expect(mark).not.toBeNull();
    expect(mark.textContent).toBe("결제");
    expect(mark.className).toContain("bg-search-mark");
    expect(mark.className).not.toMatch(/text-(xs|sm|lg|base)\b/);
  });

  it("걸린 카드 안 티켓 제목의 칩도 대소문자 무관 부분 일치로 뜬다", () => {
    renderView(SEARCH_DATA);
    fireEvent.change(searchBox(), { target: { value: "OAUTH" } });
    const heading = screen.getByRole("heading", { name: "로그인" });
    expect(heading.closest("button")).toHaveAttribute("aria-expanded", "true");
    const mark = getByFullText("OAuth 교환").querySelector("mark")!;
    expect(mark.textContent).toBe("OAuth");
  });

  it("🔴 접힌 카드 안 티켓 제목으로 걸러지고, 그 카드가 펼쳐진 채로 뜬다 — ⌘F 로는 안 되던 일", () => {
    renderView(SEARCH_DATA);
    // "소셜" 은 auth-login 카드 이름에는 없고, 접힌 채인 03번 티켓 제목("소셜 로그인")에만 있다.
    fireEvent.change(searchBox(), { target: { value: "소셜" } });
    const heading = screen.getByRole("heading", { name: "로그인" });
    expect(heading.closest("button")).toHaveAttribute("aria-expanded", "true");
    expect(getByFullText("소셜 로그인")).toBeInTheDocument();
    // 이름도 티켓도 안 걸린 카드는 사라진다.
    expect(screen.queryByRole("heading", { name: "결제" })).toBeNull();
  });

  it("🔴 신관례(tickets/) 티켓 제목으로도 걸린다 — 검색이 두 관례를 합쳐 읽는다(실제 결함)", () => {
    renderView(SEARCH_DATA);
    fireEvent.change(searchBox(), { target: { value: "푸시" } });
    const heading = screen.getByRole("heading", { name: "알림" });
    expect(heading.closest("button")).toHaveAttribute("aria-expanded", "true");
    expect(getByFullText("푸시 발송")).toBeInTheDocument();
    // 안 걸린 카드는 사라진다.
    expect(screen.queryByRole("heading", { name: "결제" })).toBeNull();
  });

  it("아무것도 안 걸리면 없다고 말한다 — 빈 화면으로 두지 않는다", () => {
    renderView(SEARCH_DATA);
    fireEvent.change(searchBox(), { target: { value: "존재하지-않는-검색어" } });
    expect(screen.getByText("찾는 것이 없습니다")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "로그인" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "결제" })).toBeNull();
  });

  it("검색어를 지우면 원래 목록 그대로 돌아온다 — 강제로 펼쳐진 카드도 접힘으로 되돌아온다", () => {
    renderView(SEARCH_DATA);
    fireEvent.change(searchBox(), { target: { value: "소셜" } });
    expect(screen.getByRole("heading", { name: "로그인" }).closest("button")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    fireEvent.change(searchBox(), { target: { value: "" } });
    expect(screen.getByRole("heading", { name: "로그인" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "결제" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "로그인" }).closest("button")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("지우기 단추를 눌러도 원래대로 돌아온다", () => {
    renderView(SEARCH_DATA);
    fireEvent.change(searchBox(), { target: { value: "결제" } });
    expect(screen.queryByRole("heading", { name: "로그인" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "검색어 지우기" }));
    expect(screen.getByRole("heading", { name: "로그인" })).toBeInTheDocument();
    expect((searchBox() as HTMLInputElement).value).toBe("");
  });

  it("🔴 ESC 를 누르면 검색어가 지워지고 원래 목록으로 돌아온다(티켓 03)", () => {
    renderView(SEARCH_DATA);
    fireEvent.change(searchBox(), { target: { value: "소셜" } });
    expect(screen.queryByRole("heading", { name: "결제" })).toBeNull();
    fireEvent.keyDown(searchBox(), { key: "Escape" });
    expect((searchBox() as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("heading", { name: "로그인" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "결제" })).toBeInTheDocument();
  });

  it("🔴 ESC 후에도 포커스가 검색 상자에 남는다 — 바로 다시 칠 수 있다(티켓 03)", () => {
    renderView(SEARCH_DATA);
    const input = searchBox() as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "소셜" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveFocus();
    expect(input.value).toBe("");
    // 다시 검색이 바로 들어간다 — 포커스가 상자에 있어야 타이핑이 그대로 쌓인다.
    fireEvent.change(input, { target: { value: "결제" } });
    expect(screen.getByRole("heading", { name: "결제" })).toBeInTheDocument();
  });

  it("🔴 검색 후 포커스가 상자 밖으로 나가도 ESC 로 취소된다 — 문서를 읽다 돌아와도(티켓 03)", () => {
    renderView(SEARCH_DATA);
    fireEvent.change(searchBox(), { target: { value: "소셜" } });
    expect(screen.queryByRole("heading", { name: "결제" })).toBeNull();
    // 포커스가 상자 밖(예: 문서 드로어)에 있어도 창 단위 ESC 가 검색을 취소한다
    fireEvent.keyDown(window, { key: "Escape" });
    expect((searchBox() as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("heading", { name: "로그인" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "결제" })).toBeInTheDocument();
  });

  it("🔴 문서가 열려 있으면 ESC 가 먼저 문서를 닫고, 그다음 ESC 가 검색을 취소한다(티켓 03)", () => {
    renderViewWithOpenDoc(SEARCH_DATA, "issues/01-session.md");
    // 문서 드로어가 열려 있다
    expect(screen.getByRole("dialog", { name: "issues/01-session.md" })).toBeInTheDocument();
    fireEvent.change(searchBox(), { target: { value: "소셜" } });
    expect(screen.queryByRole("heading", { name: "결제" })).toBeNull();

    // 1차 ESC — 문서 닫기. 검색어는 그대로 남는다
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "issues/01-session.md" })).toBeNull();
    expect((searchBox() as HTMLInputElement).value).toBe("소셜");

    // 2차 ESC — 검색 취소
    fireEvent.keyDown(window, { key: "Escape" });
    expect((searchBox() as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("heading", { name: "로그인" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "결제" })).toBeInTheDocument();
  });

  it("🔴 미해소 사본 구역은 검색과 무관하게 그대로 선다 — 경고를 검색어로 숨길 수 없다", () => {
    renderView({
      ...SEARCH_DATA,
      inProgress: {
        ...NO_WORK,
        unknown: [{ slug: "alpha-abc123/2", branch: "fm/mystery", path: "/tmp/th/alpha-abc123/2" }],
      },
    });
    fireEvent.change(searchBox(), { target: { value: "존재하지-않는-검색어" } });
    expect(screen.getByText(/티켓 미상 · 작업중 1/)).toBeInTheDocument();
  });

  it("🔴 정규식 특수문자를 넣어도 깨지지 않는다 — 글자로 다루지 규칙으로 다루지 않는다", () => {
    renderView(SEARCH_DATA);
    fireEvent.change(searchBox(), { target: { value: "[a-z]+(.*)$^" } });
    expect(screen.getByText("찾는 것이 없습니다")).toBeInTheDocument();
    fireEvent.change(searchBox(), { target: { value: "" } });
    expect(screen.getByRole("heading", { name: "로그인" })).toBeInTheDocument();
  });

  it("기존 동작이 그대로 산다 — 검색과 무관하게 손으로 펼치고 접을 수 있다", () => {
    renderView(SEARCH_DATA);
    openCard("결제");
    expect(screen.getByText("정기 결제")).toBeInTheDocument();
  });
});

describe("FeaturesView — 완료 영역은 최근 완료가 위(plan 탭과 같은 정렬, INV-4)", () => {
  /** 완료 탭 정렬용 — board(자리 행)와 features(문서) 둘 다 시드한다. */
  function renderDoneBoard(features: FeaturesResponse["features"], done: PlanCard[]) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const board: PlanBoardResponse = {
      project: "alpha",
      waiting: [],
      active: [],
      reserved: [],
      discarded: [],
      done,
    };
    qc.setQueryData(qk.features("alpha"), { project: "alpha", features, inProgress: NO_WORK });
    qc.setQueryData(qk.plan("alpha"), board);
    return render(
      <QueryClientProvider client={qc}>
        <FeaturesView project="alpha" view={null} onView={() => {}} />
      </QueryClientProvider>,
    );
  }

  function doneFeature(slug: string, completedAt: string): FeatureTicket {
    return {
      num: "01",
      slug: "01-x",
      path: "issues/01-x.md",
      title: "완료 티켓",
      status: "done",
      sourceStatus: `resolved (${completedAt})`,
      statusKnown: true,
      completedAt,
      blockedBy: [],
      unreadableBlockedBy: [],
      waitingOn: [],
      startable: true,
      needsCaptainEye: false,
    };
  }

  it("완료 영역 카드가 최근 완료순(closedAt 내림차순)으로 보인다", () => {
    const mkFeature = (slug: string, completedAt: string) => ({
      slug,
      title: `${slug} — 제목`,
      status: "pending" as const,
      sourceStatus: "draft",
      statusKnown: true,
      docs: [ISSUES_DIR],
      tickets: [doneFeature(slug, completedAt)],
    });
    const old = mkFeature("done-old", "2026-08-01");
    const recent = mkFeature("done-recent", "2026-09-15");
    const middle = mkFeature("done-middle", "2026-09-01");
    const doneCards: PlanCard[] = [
      { feature: old, seq: 0, closedAt: "2026-08-01 09:00" },
      { feature: recent, seq: 1, closedAt: "2026-09-15 09:00" },
      { feature: middle, seq: 2, closedAt: "2026-09-01 09:00" },
    ];
    renderDoneBoard([old, recent, middle], doneCards);

    // 완료 탭 선택
    fireEvent.click(screen.getByRole("tab", { name: /완료/ }));

    // 카드의 slug 줄(제목과 별개 span)을 DOM 순서로 모은다 — 최근 완료(recent)가 맨 위
    const slugs = [...document.querySelectorAll("span.mono")]
      .map((s) => s.textContent)
      .filter((t): t is string => !!t && /^done-/.test(t));
    expect(slugs).toEqual(["done-recent", "done-middle", "done-old"]);
  });
});
