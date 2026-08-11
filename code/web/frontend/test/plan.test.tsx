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
          needsCaptainEye: false,
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
          needsCaptainEye: false,
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
          needsCaptainEye: false,
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
        tickets: [
          {
            feature: "auth-login",
            ticket: "02",
            title: "로그인 화면",
            why: "01 은 이미 끝났다",
            needsCaptainEye: false,
          },
        ],
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
    captainEyeCount: 0,
  },
  dragWarnings: {},
};

/** view·doc 상태를 실제로 URL 훅처럼 들고 있는 최소 하네스 — 탭 전환·문서 열기 왕복을 실제로 검증한다. */
function Harness({ project, initialView = null }: { project: string; initialView?: string | null }) {
  const [view, setView] = useState<string | null>(initialView);
  const [doc, setDoc] = useState<string | null>(null);
  return <PlanView project={project} view={view} onView={setView} doc={doc} onDoc={setDoc} />;
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

/** 단계 보기에서 티켓 칩 하나를 다른(또는 같은) 단계 카드의 특정 트랙 묶음에 끌어 놓는다. */
function dragTicketInto(chipText: string, trackText: string, step: number) {
  const chip = screen.getByText(chipText).closest("span")!;
  const card = screen.getByText(`단계 ${step}`).closest("section")!;
  const group = within(card).getByText(trackText).closest("div")!;
  const dt = makeDataTransfer();
  fireEvent.dragStart(chip, { dataTransfer: dt });
  fireEvent.dragOver(group, { dataTransfer: dt });
  fireEvent.drop(group, { dataTransfer: dt });
}

describe("PlanView — 단계 보기(기본, 카드는 단계 · 그 안은 트랙별 묶음)", () => {
  it("카드는 단계를 나타내고, 그 안에서 트랙별로 티켓이 묶인다", () => {
    renderPlan();
    const card = screen.getByText("단계 1").closest("section")!;
    const webGroup = within(card).getByText("web").closest("div")!;
    const paymentsGroup = within(card).getByText("payments").closest("div")!;
    expect(within(webGroup).getByText("auth-login/02")).toBeInTheDocument();
    expect(within(paymentsGroup).getByText("billing/01")).toBeInTheDocument();
    // 🔴 트랙을 한 줄로 펴지 않는다 — 같은 카드 안에서도 트랙별 묶음이 나뉜다.
    expect(within(webGroup).queryByText("billing/01")).toBeNull();
    expect(within(paymentsGroup).queryByText("auth-login/02")).toBeNull();
  });

  it("단계마다 카드 하나 — 그 단계에 티켓이 있는 트랙만 묶여 나타난다", () => {
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

    const step1 = screen.getByText("단계 1").closest("section")!;
    const step2 = screen.getByText("단계 2").closest("section")!;
    // 단계 1 카드엔 web·payments 묶음만 있다 — gateway 는 아직 없다.
    expect(within(step1).getByText("web")).toBeInTheDocument();
    expect(within(step1).getByText("payments")).toBeInTheDocument();
    expect(within(step1).queryByText("gateway")).toBeNull();
    // 단계 2 카드엔 gateway 묶음만 있다.
    expect(within(step2).getByText("gateway")).toBeInTheDocument();
    expect(within(step2).queryByText("web")).toBeNull();
    expect(within(step2).queryByText("payments")).toBeNull();
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

// 🔴 티켓 04 §무엇이 바뀌나: "티켓 칩 → 단계", "기능 카드 → 트랙" 으로 축이 갈라져 있다.
// 09 시절 "칩을 다른 트랙 상자로 끌면 기능의 트랙이 바뀐다"는 그 표와 어긋나 있었다 — 캡틴
// 피드백(2026-08-11, "track이 다르면 막아야 하지 않나 — track은 고정 아닌가")으로 04 표에 맞춘다.
describe("PlanView — 단계 보기에서 다른 트랙 상자에 놓아도 트랙은 안 바뀐다(04 표 교정, 🔴 첫 커버)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("다른 트랙 상자 위에서는 '트랙 그대로' 가 보이고, 놓으면 단계만 바뀐다 — 트랙은 안 바뀐다", async () => {
    const moveFeatureRank = vi.spyOn(api, "moveFeatureRank");
    vi.spyOn(api, "moveTicketStep").mockResolvedValue({ order: DATA.order, warnings: [] });
    vi.spyOn(api, "fetchPlan").mockResolvedValue(DATA);
    renderPlan();

    const chip = screen.getByText("auth-login/02").closest("span")!; // 지금 트랙 = web
    const step1Card = screen.getByText("단계 1").closest("section")!;
    const paymentsGroup = within(step1Card).getByText("payments").closest("div")!;
    const dt = makeDataTransfer();
    fireEvent.dragStart(chip, { dataTransfer: dt });
    fireEvent.dragOver(paymentsGroup, { dataTransfer: dt });

    // 놓기 전에 — 트랙은 그대로라는 것이 끄는 동안 보인다.
    expect(within(paymentsGroup).getByText("「web」 트랙 그대로 — 단계만 여기로")).toBeInTheDocument();

    fireEvent.drop(paymentsGroup, { dataTransfer: dt });

    await waitFor(() =>
      expect(api.moveTicketStep).toHaveBeenCalledWith("alpha", { feature: "auth-login", ticket: "02", step: 1 }),
    );
    expect(moveFeatureRank).not.toHaveBeenCalled(); // 트랙은 이 경로로 절대 안 바뀐다
  });
});

// 🔴 첫 커버 — 캡틴 피드백: "지금은 새 단계를 추가하는 것만 가능해. 단계 내에서 기존 트랙으로
// 추가가 가능하게 해줘" + "track이 다르면 막아야 하지 않나 — track은 고정 아닌가". 그 단계에
// 내 트랙 상자가 아직 없어도 카드 배경에 놓으면 옮기고, 트랙은 그 경로로는 절대 안 바뀐다.
describe("PlanView — 단계 카드 배경에 놓으면 트랙은 그대로 그 단계로 옮긴다(캡틴 피드백, 🔴 첫 커버)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("그 단계에 내 트랙 상자가 없어도 카드 배경에 놓으면 옮겨진다 — 트랙은 안 바뀐다", async () => {
    // 단계 2 는 web 상자만 있다(payments 상자는 없다) — billing/01(payments)을 그리로 끈다.
    const data: PlanResponse = {
      ...DATA,
      order: {
        ...DATA.order,
        tickets: DATA.order.tickets.map((t) =>
          t.feature === "auth-login" && t.ticket === "02" ? { ...t, step: 2 } : t,
        ),
      },
    };
    vi.spyOn(api, "moveTicketStep").mockResolvedValue({ order: data.order, warnings: [] });
    const moveFeatureRank = vi.spyOn(api, "moveFeatureRank");
    vi.spyOn(api, "fetchPlan").mockResolvedValue(data);
    renderPlan(data);

    const chip = screen.getByText("billing/01").closest("span")!; // 지금 트랙 = payments
    const step2Section = screen.getByText("단계 2").closest("section")!;
    expect(within(step2Section).queryByText("payments")).toBeNull(); // 상자가 아직 없다

    const dt = makeDataTransfer();
    fireEvent.dragStart(chip, { dataTransfer: dt });
    fireEvent.dragOver(step2Section, { dataTransfer: dt });
    expect(within(step2Section).getByText("「payments」 트랙 그대로 여기(단계 2)로")).toBeInTheDocument();
    fireEvent.drop(step2Section, { dataTransfer: dt });

    await waitFor(() =>
      expect(api.moveTicketStep).toHaveBeenCalledWith("alpha", { feature: "billing", ticket: "01", step: 2 }),
    );
    expect(moveFeatureRank).not.toHaveBeenCalled(); // 트랙은 이 경로로 절대 안 바뀐다
  });

  it("기존 트랙 상자 위에 놓으면 카드 배경 문구와 안 겹치고, 그 상자도 트랙을 안 바꾼다", async () => {
    vi.spyOn(api, "moveTicketStep").mockResolvedValue({ order: DATA.order, warnings: [] });
    const moveFeatureRank = vi.spyOn(api, "moveFeatureRank");
    vi.spyOn(api, "fetchPlan").mockResolvedValue(DATA);
    renderPlan();

    const chip = screen.getByText("auth-login/02").closest("span")!; // 지금 트랙 = web
    const step1Card = screen.getByText("단계 1").closest("section")!;
    const webGroup = within(step1Card).getByText("web").closest("div")!;
    const dt = makeDataTransfer();
    fireEvent.dragStart(chip, { dataTransfer: dt });
    fireEvent.dragOver(webGroup, { dataTransfer: dt });
    // 카드 배경 문구(제자리 트랙 유지)가 상자 위에서는 겹쳐 보이지 않는다.
    expect(within(step1Card).queryByText(/트랙 그대로/)).toBeNull();
    fireEvent.drop(webGroup, { dataTransfer: dt });

    await waitFor(() =>
      expect(api.moveTicketStep).toHaveBeenCalledWith("alpha", { feature: "auth-login", ticket: "02", step: 1 }),
    );
    expect(moveFeatureRank).not.toHaveBeenCalled(); // 같은 트랙 상자라 기능 트랙은 안 바뀐다
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

// 🔴 첫 커버(development-order/15 ⑤) — 티켓 칩을 누르면 그 문서가 서랍으로 열린다.
// `features` 탭과 같은 `DocDrawer`·같은 URL 인코딩(`docView.ts`)을 그대로 부른다.
describe("PlanView — 티켓 칩을 누르면 문서가 열린다(development-order/15 ⑤, 🔴 첫 커버)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("칩을 누르면 그 티켓 문서가 서랍으로 열린다", async () => {
    vi.spyOn(api, "fetchFeatureDoc").mockResolvedValue({
      path: "issues/02-screen.md",
      content: "# 02 — 로그인 화면",
    });
    renderPlan();

    fireEvent.click(screen.getByText("auth-login/02"));

    await waitFor(() =>
      expect(api.fetchFeatureDoc).toHaveBeenCalledWith("alpha", "auth-login", "issues/02-screen.md"),
    );
    const drawer = await screen.findByRole("dialog");
    expect(within(drawer).getByRole("heading", { name: "02 — 로그인 화면" })).toBeInTheDocument();
  });

  it("서랍을 닫으면 보던 자리로 돌아온다", async () => {
    vi.spyOn(api, "fetchFeatureDoc").mockResolvedValue({ path: "issues/02-screen.md", content: "# 문서" });
    renderPlan();

    fireEvent.click(screen.getByText("auth-login/02"));
    const drawer = await screen.findByRole("dialog");
    fireEvent.click(within(drawer).getByRole("button", { name: "닫기" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    // 계획 화면 자체는 그대로 남아 있다 — 탭을 건너가지 않았다.
    expect(screen.getByText("단계 1")).toBeInTheDocument();
  });

  it("🔴 끌고 놓은 것은 문서를 안 연다 — 끌기와 누르기가 안 섞인다", () => {
    const fetchDoc = vi.spyOn(api, "fetchFeatureDoc");
    renderPlan();

    const chip = screen.getByText("auth-login/02").closest("span")!;
    const dt = makeDataTransfer();
    fireEvent.dragStart(chip, { dataTransfer: dt });
    fireEvent.dragEnd(chip);
    fireEvent.click(chip);

    expect(fetchDoc).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("문서 없는 조각(계획엔 있는데 티켓 문서가 없다)은 눌러도 안 열린다", () => {
    const data: PlanResponse = {
      ...DATA,
      order: {
        ...DATA.order,
        tickets: [
          ...DATA.order.tickets,
          {
            project: "alpha",
            feature: "auth-login",
            ticket: "99",
            step: 1,
            why: "문서 없는 어긋남 시험용",
            whyNeedsReview: false,
            updatedAt: "2026-08-11T00:00:00.000Z",
          },
        ],
      },
    };
    const fetchDoc = vi.spyOn(api, "fetchFeatureDoc");
    renderPlan(data);

    fireEvent.click(screen.getByText("auth-login/99"));

    expect(fetchDoc).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
