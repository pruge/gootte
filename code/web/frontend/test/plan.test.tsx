import { useState } from "react";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PlanResponse } from "@gootte/contract";
import { PlanView } from "../src/components/plan/PlanView";
import { qk } from "../src/lib/query";
import * as api from "../src/lib/api";

// 서버가 이미 계산해 보낸 값(막힘·착수 가능·next) — 화면은 재판정하지 않는다(INV-1).
const DATA: PlanResponse = {
  project: "alpha",
  features: [
    {
      slug: "auth-login",
      title: "auth-login — 로그인",
      status: "pending",
      sourceStatus: "ready-for-agent",
      statusKnown: true,
      docs: [],
      tickets: [
        {
          num: "01",
          slug: "01-session",
          title: "세션 발급",
          status: "done",
          sourceStatus: "resolved",
          statusKnown: true,
          completedAt: "2026-08-08",
          blockedBy: [],
          unreadableBlockedBy: [],
          waitingOn: [],
          startable: true,
          workedBy: [],
        },
        {
          num: "02",
          slug: "02-screen",
          title: "로그인 화면",
          status: "pending",
          sourceStatus: "ready-for-agent",
          statusKnown: true,
          blockedBy: ["01"],
          unreadableBlockedBy: [],
          waitingOn: [],
          startable: true,
          workedBy: [],
        },
      ],
    },
    {
      slug: "billing",
      title: "billing — 결제",
      status: "pending",
      sourceStatus: "blocked",
      statusKnown: true,
      docs: [],
      tickets: [
        {
          num: "01",
          slug: "01-invoice",
          title: "청구서",
          status: "pending",
          sourceStatus: "blocked",
          statusKnown: true,
          blockedBy: ["외부 API"],
          unreadableBlockedBy: [],
          waitingOn: ["외부 API"],
          startable: false,
          workedBy: [],
        },
      ],
    },
  ],
  order: {
    project: "alpha",
    features: [
      {
        project: "alpha",
        feature: "auth-login",
        track: "web",
        rank: 10,
        why: "먼저 끝낸다",
        whyNeedsReview: false,
        updatedAt: "2026-08-11T00:00:00.000Z",
      },
      {
        project: "alpha",
        feature: "billing",
        track: "payments",
        rank: 10,
        why: "두 번째",
        whyNeedsReview: false,
        updatedAt: "2026-08-11T00:00:00.000Z",
      },
    ],
    tickets: [
      {
        project: "alpha",
        feature: "auth-login",
        ticket: "02",
        step: 1,
        why: "01 은 이미 끝났다",
        whyNeedsReview: false,
        updatedAt: "2026-08-11T00:00:00.000Z",
      },
      {
        project: "alpha",
        feature: "billing",
        ticket: "01",
        step: 1,
        why: "막힘 확인용",
        whyNeedsReview: false,
        updatedAt: "2026-08-11T00:00:00.000Z",
      },
    ],
  },
  next: {
    tracks: [
      {
        track: "web",
        step: 1,
        tickets: [{ feature: "auth-login", ticket: "02", title: "로그인 화면", why: "01 은 이미 끝났다" }],
        emptyReason: null,
      },
      { track: "payments", step: 1, tickets: [], emptyReason: "all_blocked" },
    ],
    mismatches: [
      {
        kind: "ticket_without_step",
        feature: "auth-login",
        ticket: "03",
        detail: "auth-login/03 — 계획에 단계가 없다",
      },
    ],
  },
  dragWarnings: {},
};

/** view 상태를 실제로 URL 훅처럼 들고 있는 최소 하네스 — 탭 전환 왕복을 실제로 검증한다. */
function Harness({ project, initialView = null }: { project: string; initialView?: string | null }) {
  const [view, setView] = useState<string | null>(initialView);
  return <PlanView project={project} view={view} onView={setView} />;
}

function renderPlan(data: PlanResponse = DATA, initialView: string | null = null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(qk.plan(data.project), data);
  const result = render(
    <QueryClientProvider client={qc}>
      <Harness project={data.project} initialView={initialView} />
    </QueryClientProvider>,
  );
  return { ...result, qc };
}

/** jsdom 은 DataTransfer 를 구현하지 않는다 — setData/getData/types 를 갖는 최소 흉내를 직접 만든다. */
function makeDataTransfer() {
  const store: Record<string, string> = {};
  return {
    setData: (type: string, val: string) => {
      store[type] = val;
    },
    getData: (type: string) => store[type] ?? "",
    get types() {
      return Object.keys(store);
    },
    dropEffect: "",
    effectAllowed: "",
  };
}

/** 단계 보기에서 티켓 칩 하나를 다른(또는 같은) 칸의 특정 단계 셀에 끌어 놓는다. */
function dragTicketInto(chipText: string, trackText: string, step: number) {
  const chip = screen.getByText(chipText).closest("span")!;
  const column = screen.getByText(trackText).closest("div")!;
  const cell = within(column).getByText(`단계 ${step}`).closest("div")!;
  const dt = makeDataTransfer();
  fireEvent.dragStart(chip, { dataTransfer: dt });
  fireEvent.dragOver(cell, { dataTransfer: dt });
  fireEvent.drop(cell, { dataTransfer: dt });
}

describe("PlanView — 단계 보기(기본, 티켓 09 ③ 트랙마다 세로 칸)", () => {
  it("트랙마다 자기 칸을 갖고, 같은 단계의 티켓이 각자의 칸에 담긴다", () => {
    renderPlan();
    const webColumn = screen.getByText("web").closest("div")!;
    const paymentsColumn = screen.getByText("payments").closest("div")!;
    expect(within(webColumn).getByText("auth-login/02")).toBeInTheDocument();
    expect(within(paymentsColumn).getByText("billing/01")).toBeInTheDocument();
    // 🔴 트랙을 한 줄로 펴지 않는다 — 서로 다른 칸에 나뉘어 있다.
    expect(within(webColumn).queryByText("billing/01")).toBeNull();
    expect(within(paymentsColumn).queryByText("auth-login/02")).toBeNull();
  });

  it("🔴 같은 단계가 칸들 사이에서 같은 순서로 선다 — 비어 있는 트랙도 자리를 지킨다", () => {
    const data: PlanResponse = {
      ...DATA,
      order: {
        ...DATA.order,
        features: [
          ...DATA.order.features,
          {
            project: "alpha",
            feature: "gateway-ctl",
            track: "gateway",
            rank: 10,
            why: "게이트웨이 제어",
            whyNeedsReview: false,
            updatedAt: "2026-08-11T00:00:00.000Z",
          },
        ],
        tickets: [
          ...DATA.order.tickets,
          {
            project: "alpha",
            feature: "gateway-ctl",
            ticket: "01",
            step: 2,
            why: "web·payments 뒤에 온다",
            whyNeedsReview: false,
            updatedAt: "2026-08-11T00:00:00.000Z",
          },
        ],
      },
    };
    renderPlan(data);

    const webColumn = screen.getByText("web").closest("div")!;
    const paymentsColumn = screen.getByText("payments").closest("div")!;
    const gatewayColumn = screen.getByText("gateway").closest("div")!;

    const labelsOf = (col: HTMLElement) => within(col).getAllByText(/^단계 \d+$/).map((el) => el.textContent);
    // 🔴 세 칸 모두 같은 단계 목록을 같은 순서로 갖는다 — 그래야 같은 단계가 나란히 선다.
    expect(labelsOf(webColumn)).toEqual(["단계 1", "단계 2"]);
    expect(labelsOf(paymentsColumn)).toEqual(["단계 1", "단계 2"]);
    expect(labelsOf(gatewayColumn)).toEqual(["단계 1", "단계 2"]);

    // web·payments 엔 단계 2 티켓이 없어도 자리(빈 칸)는 유지된다.
    expect(within(within(webColumn).getByText("단계 2").closest("div")!).getByText("—")).toBeInTheDocument();
    expect(within(within(paymentsColumn).getByText("단계 2").closest("div")!).getByText("—")).toBeInTheDocument();
    // gateway 엔 단계 1 티켓이 없어도 자리는 유지된다 — 단계 2 는 실제로 채워져 있다.
    expect(within(within(gatewayColumn).getByText("단계 1").closest("div")!).getByText("—")).toBeInTheDocument();
    expect(within(within(gatewayColumn).getByText("단계 2").closest("div")!).queryByText("—")).toBeNull();
  });

  it("🔴 어긋남은 접히지 않고 바로 보인다 — 아무것도 안 눌러도 뜬다", () => {
    renderPlan();
    expect(screen.getByText("auth-login/03 — 계획에 단계가 없다")).toBeInTheDocument();
  });

  /**
   * 🔴 캡틴이 실제로 부딪히신 것(2026-08-11): 어긋남이 0 인데 주황색 상자가 남아 있었다.
   * 남아 있던 것은 어긋남이 아니라 **닫지 않은 드래그 경고**였다 — 둘이 같은 옷을 입고
   * 나란히 서 있어 구분이 안 됐다(티켓 09 ②).
   */
  it("🔴 어긋남이 0 건이면 어긋남 상자가 아예 안 뜬다", () => {
    renderPlan({ ...DATA, next: { ...DATA.next, mismatches: [] } });
    expect(screen.queryByText(/어긋남/)).toBeNull();
    expect(screen.queryByText("auth-login/03 — 계획에 단계가 없다")).toBeNull();
  });

  it("🔴 아무것도 안 끈 첫 화면에는 드래그 경고가 없다 — 서버가 무언가를 알고 있어도", () => {
    renderPlan({ ...DATA, dragWarnings: { "billing/01": [{ kind: "claimed", detail: "지금 걸림" }] } });
    expect(screen.queryByText(/방금 그 드래그가 걸렸습니다/)).toBeNull();
    expect(screen.queryByText("지금 걸림")).toBeNull();
  });
});

describe("PlanView — 조작 줄(티켓 09 ④, 스크롤해도 화면에 남는다)", () => {
  it("🔴 보기 전환·next 는 스크롤 영역 밖에 있다 — 계획 본문만 스크롤한다", () => {
    renderPlan();
    const tablist = screen.getByRole("tablist", { name: "보기" });
    const nextButton = screen.getByRole("button", { name: /next/i });
    expect(tablist.closest(".overflow-y-auto")).toBeNull();
    expect(nextButton.closest(".overflow-y-auto")).toBeNull();
    // 대조군 — 계획 본문(어긋남 등)은 스크롤 영역 안에 있다.
    expect(screen.getByText("auth-login/03 — 계획에 단계가 없다").closest(".overflow-y-auto")).not.toBeNull();
  });
});

describe("PlanView — `next` 버튼(02 의 함수 결과를 그대로 쓴다)", () => {
  it("누르면 트랙별 결과가 뜬다 — 있으면 개수, 비면 이유(빈 화면이 '할 일 없음'과 '전부 막힘'을 구분한다)", () => {
    renderPlan();
    expect(screen.queryByText("지금 1개 나란히")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText("지금 1개 나란히")).toBeInTheDocument();
    expect(screen.getByText(/전부 막힘/)).toBeInTheDocument();
  });

  it("다시 누르면 풀린다", () => {
    renderPlan();
    const button = screen.getByRole("button", { name: /next/i });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("지금 1개 나란히")).toBeNull();
  });
});

describe("PlanView — 기능 보기", () => {
  it("`?view=feature` 로 트랙(세로줄) 안에 기능 카드가 순위대로 뜬다", () => {
    renderPlan(DATA, "feature");
    expect(screen.getByText("auth-login — 로그인")).toBeInTheDocument();
    expect(screen.getByText("billing — 결제")).toBeInTheDocument();
    expect(screen.getByText("먼저 끝낸다")).toBeInTheDocument();
  });
});

// 🔴 첫 커버(spec §검증) — 드래그 → 쓰기(서버 POST) → 재조회로 값이 남는다. 실제 fetch 대신
// api.ts 의 함수를 스텁해 왕복만 확인한다(백엔드 쓰기 자체는 core-io·backend 단위 테스트가 덮는다).
describe("PlanView — 드래그(티켓 04, 🔴 첫 커버) → 쓰기 → 재조회로 값이 남는다", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("티켓 칩을 다른 단계 칸에 놓으면 moveTicketStep 이 불리고, 재조회 결과가 화면에 반영된다", async () => {
    const refetched: PlanResponse = {
      ...DATA,
      order: {
        ...DATA.order,
        tickets: DATA.order.tickets.map((t) =>
          t.feature === "billing" && t.ticket === "01" ? { ...t, step: 1, whyNeedsReview: true } : t,
        ),
      },
    };
    vi.spyOn(api, "moveTicketStep").mockResolvedValue({ order: refetched.order, warnings: [] });
    vi.spyOn(api, "fetchPlan").mockResolvedValue(refetched);

    renderPlan();
    dragTicketInto("billing/01", "payments", 1);

    await waitFor(() => expect(api.moveTicketStep).toHaveBeenCalledWith("alpha", { feature: "billing", ticket: "01", step: 1 }));
    await waitFor(() => expect(api.fetchPlan).toHaveBeenCalled());
  });

  it("기능 카드를 끌면 moveFeatureRank 가 불린다", async () => {
    vi.spyOn(api, "moveFeatureRank").mockResolvedValue({ order: DATA.order, warnings: [] });
    vi.spyOn(api, "fetchPlan").mockResolvedValue(DATA);

    renderPlan(DATA, "feature");

    const card = screen.getByText("billing — 결제").closest("div[draggable]")!;
    const lane = screen.getByText("payments").closest("section")!;
    const dt = makeDataTransfer();
    fireEvent.dragStart(card, { dataTransfer: dt });
    fireEvent.dragOver(lane, { dataTransfer: dt });
    fireEvent.drop(lane, { dataTransfer: dt });

    await waitFor(() => expect(api.moveFeatureRank).toHaveBeenCalled());
  });
});

// 🔴 첫 커버(티켓 09 ③) — 단계 보기에서 다른 칸으로 끌면 기능 전체의 트랙이 바뀐다.
describe("PlanView — 단계 보기에서 다른 칸으로 끌면 기능의 트랙이 바뀐다(티켓 09 ③, 🔴 첫 커버)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("끄는 동안 무엇이 바뀌는지 보이고, 놓으면 트랙과 단계가 함께 바뀐다", async () => {
    vi.spyOn(api, "moveFeatureRank").mockResolvedValue({ order: DATA.order, warnings: [] });
    vi.spyOn(api, "moveTicketStep").mockResolvedValue({ order: DATA.order, warnings: [] });
    vi.spyOn(api, "fetchPlan").mockResolvedValue(DATA);
    renderPlan();

    const chip = screen.getByText("auth-login/02").closest("span")!; // 지금 트랙 = web
    const paymentsColumn = screen.getByText("payments").closest("div")!;
    const targetCell = within(paymentsColumn).getByText("단계 1").closest("div")!;
    const dt = makeDataTransfer();
    fireEvent.dragStart(chip, { dataTransfer: dt });
    fireEvent.dragOver(targetCell, { dataTransfer: dt });

    // 🔴 놓기 전에 — 기능 전체가 이동한다는 것이 끄는 동안 보인다(티켓 04 캡틴 확인 1).
    expect(within(targetCell).getByText("기능 전체가 「payments」로 이동합니다")).toBeInTheDocument();

    fireEvent.drop(targetCell, { dataTransfer: dt });

    await waitFor(() =>
      expect(api.moveFeatureRank).toHaveBeenCalledWith("alpha", {
        feature: "auth-login",
        track: "payments",
        beforeRank: null,
        afterRank: null,
      }),
    );
    expect(api.moveTicketStep).toHaveBeenCalledWith("alpha", { feature: "auth-login", ticket: "02", step: 1 });
  });
});

// 🔴 첫 커버(티켓 09 ②) — 서버가 매 읽기 다시 계산해 보낸 dragWarnings 를 화면이 찾아 보여줄 뿐,
// 스스로 판정하지 않는다("다시 물어서 갱신한다").
describe("PlanView — 드래그 경고(티켓 09 ②, 다시 물어서 갱신한다, 🔴 첫 커버)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("드래그 직후 서버가 dragWarnings 를 실어 보내면 그 배치 옆에 뜬다", async () => {
    const warned: PlanResponse = {
      ...DATA,
      dragWarnings: { "billing/01": [{ kind: "claimed", detail: "지금 걸림" }] },
    };
    vi.spyOn(api, "moveTicketStep").mockResolvedValue({ order: DATA.order, warnings: [] });
    vi.spyOn(api, "fetchPlan").mockResolvedValue(warned);
    renderPlan();

    dragTicketInto("billing/01", "payments", 1);

    await waitFor(() => expect(screen.getByText("지금 걸림")).toBeInTheDocument());
  });

  it("🔴 곧바로 되돌려 조건이 사라지면 ✕ 없이도 스스로 없어진다", async () => {
    const warned: PlanResponse = { ...DATA, dragWarnings: { "billing/01": [{ kind: "claimed", detail: "지금 걸림" }] } };
    const clean: PlanResponse = { ...DATA, dragWarnings: {} };
    vi.spyOn(api, "moveTicketStep").mockResolvedValue({ order: DATA.order, warnings: [] });
    vi.spyOn(api, "fetchPlan").mockResolvedValueOnce(warned).mockResolvedValueOnce(clean);
    renderPlan();

    dragTicketInto("billing/01", "payments", 1);
    await waitFor(() => expect(screen.getByText("지금 걸림")).toBeInTheDocument());

    dragTicketInto("billing/01", "payments", 1);
    await waitFor(() => expect(screen.queryByText("지금 걸림")).toBeNull());
  });

  it("🔴 계획이 다른 경로(터미널·WS 등)로 바뀌어도 낡은 경고가 안 남는다", async () => {
    const warned: PlanResponse = { ...DATA, dragWarnings: { "billing/01": [{ kind: "claimed", detail: "지금 걸림" }] } };
    const clean: PlanResponse = { ...DATA, dragWarnings: {} };
    vi.spyOn(api, "moveTicketStep").mockResolvedValue({ order: DATA.order, warnings: [] });
    const fetchMock = vi.spyOn(api, "fetchPlan").mockResolvedValueOnce(warned);
    const { qc } = renderPlan();

    dragTicketInto("billing/01", "payments", 1);
    await waitFor(() => expect(screen.getByText("지금 걸림")).toBeInTheDocument());

    // 이 세션에서 새로 끈 것이 아니라 — 다른 경로로 계획이 바뀌었다고 가정하고 다시 읽는다.
    fetchMock.mockResolvedValueOnce(clean);
    await qc.invalidateQueries({ queryKey: qk.plan("alpha") });

    await waitFor(() => expect(screen.queryByText("지금 걸림")).toBeNull());
  });

  it("🔴 ✕ 로 닫은 경고는 배치가 다시 바뀌기 전까지 닫혀 있다", async () => {
    const warned: PlanResponse = { ...DATA, dragWarnings: { "billing/01": [{ kind: "claimed", detail: "지금 걸림" }] } };
    vi.spyOn(api, "moveTicketStep").mockResolvedValue({ order: DATA.order, warnings: [] });
    vi.spyOn(api, "fetchPlan").mockResolvedValue(warned);
    const { qc } = renderPlan();

    dragTicketInto("billing/01", "payments", 1);
    await waitFor(() => expect(screen.getByText("지금 걸림")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByText("지금 걸림")).toBeNull();

    // 같은 배치인 채로 다시 읽어도(예: 포커스 리페치) 닫힌 채로 있는다.
    await qc.invalidateQueries({ queryKey: qk.plan("alpha") });
    await waitFor(() => expect(api.fetchPlan).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("지금 걸림")).toBeNull();

    // 배치가 다시 바뀌면(새 드래그) 그 새 드래그에 대해서는 다시 뜬다.
    dragTicketInto("billing/01", "payments", 1);
    await waitFor(() => expect(screen.getByText("지금 걸림")).toBeInTheDocument());
  });
});
