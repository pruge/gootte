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
        kind: "planned",
        why: "01 은 이미 끝났다",
        whyNeedsReview: false,
        updatedAt: "2026-08-11T00:00:00.000Z",
      },
      {
        project: "alpha",
        feature: "billing",
        ticket: "01",
        step: 1,
        kind: "planned",
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
  askTriggers: [],
  askRequests: [],
};

/** view 상태를 실제로 URL 훅처럼 들고 있는 최소 하네스 — 탭 전환 왕복을 실제로 검증한다. */
function Harness({ project, initialView = null }: { project: string; initialView?: string | null }) {
  const [view, setView] = useState<string | null>(initialView);
  return <PlanView project={project} view={view} onView={setView} />;
}

function renderPlan(data: PlanResponse = DATA, initialView: string | null = null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(qk.plan(data.project), data);
  return render(
    <QueryClientProvider client={qc}>
      <Harness project={data.project} initialView={initialView} />
    </QueryClientProvider>,
  );
}

describe("PlanView — 단계 보기(기본)", () => {
  it("같은 단계가 한 줄에 모이고, 트랙마다 자기 묶음을 갖는다", () => {
    renderPlan();
    const step1 = screen.getByText("단계 1").closest("section")!;
    expect(within(step1).getByText("web")).toBeInTheDocument();
    expect(within(step1).getByText("payments")).toBeInTheDocument();
    expect(within(step1).getByText("auth-login/02")).toBeInTheDocument();
    expect(within(step1).getByText("billing/01")).toBeInTheDocument();
  });

  it("🔴 어긋남은 접히지 않고 바로 보인다 — 아무것도 안 눌러도 뜬다", () => {
    renderPlan();
    expect(screen.getByText("auth-login/03 — 계획에 단계가 없다")).toBeInTheDocument();
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

// 🔴 첫 커버(spec §검증) — 드래그 → 쓰기(서버 POST) → 재조회로 값이 남는다. 실제 fetch 대신
// api.ts 의 함수를 스텁해 왕복만 확인한다(백엔드 쓰기 자체는 core-io·backend 단위 테스트가 덮는다).
describe("PlanView — 드래그(티켓 04, 🔴 첫 커버) → 쓰기 → 재조회로 값이 남는다", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("티켓 칩을 다른 단계 줄에 놓으면 moveTicketStep 이 불리고, 재조회 결과가 화면에 반영된다", async () => {
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

    const chip = screen.getByText("billing/01").closest("span")!;
    const step1Section = screen.getByText("단계 1").closest("section")!;
    const dt = makeDataTransfer();
    fireEvent.dragStart(chip, { dataTransfer: dt });
    fireEvent.dragOver(step1Section, { dataTransfer: dt });
    fireEvent.drop(step1Section, { dataTransfer: dt });

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

// 🔴 첫 커버(spec 06 §테스트) — 답이 요약 없이 그대로 실린다, 그리고 버튼이 04 의 즉시 검사와 섞이지 않는다.
describe("PlanView — 판단 요청(티켓 06, 🔴 첫 커버)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("조건이 없으면 판단 요청 패널이 안 뜬다", () => {
    renderPlan();
    expect(screen.queryByText("판단이 필요합니다 — 캡틴 의견을 청할 수 있습니다")).toBeNull();
  });

  it("버튼이 뜨는 자리가 있으면 [의견 물어보기] 가 보이고, 04 의 놓는 순간 배너와는 다른 문구다", () => {
    const data: PlanResponse = {
      ...DATA,
      askTriggers: [
        { kind: "new_parallel", feature: null, step: 1, detail: "단계 1에 서로 다른 기능이 나란히 놓였다 — 정말 무관한지 봐 달라" },
      ],
    };
    renderPlan(data);
    expect(screen.getByText("단계 1에 서로 다른 기능이 나란히 놓였다 — 정말 무관한지 봐 달라")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "의견 물어보기" })).toBeInTheDocument();
    // 놓는 순간 검사(04)의 문구("막지 않습니다")는 여기 없다 — 두 덩이가 섞이지 않는다.
    expect(screen.queryByText(/놓는 순간 알아챈 것/)).toBeNull();
  });

  it("누르면 요청이 남고(verbatim detail 전송) 버튼이 보냈습니다로 바뀐다", async () => {
    const detail = "단계 1에 서로 다른 기능이 나란히 놓였다 — 정말 무관한지 봐 달라";
    const data: PlanResponse = { ...DATA, askTriggers: [{ kind: "new_parallel", feature: null, step: 1, detail }] };
    const created = {
      id: 1,
      project: "alpha",
      batchSummary: "…",
      question: detail,
      answer: null,
      done: false,
      updatedAt: "2026-08-11T00:00:00.000Z",
    };
    vi.spyOn(api, "postAsk").mockResolvedValue(created);
    vi.spyOn(api, "fetchPlan").mockResolvedValue({ ...data, askRequests: [created] });
    renderPlan(data);

    fireEvent.click(screen.getByRole("button", { name: "의견 물어보기" }));

    await waitFor(() => expect(api.postAsk).toHaveBeenCalledWith("alpha", detail));
    expect(screen.getByRole("button", { name: "보냈습니다" })).toBeDisabled();
  });

  it("답이 도착하면 그 배치 옆에 verbatim 으로 붙는다 — 요약하지 않는다", () => {
    const answer = "무관하다 — 이대로 가자. 잘라내지도 다듬지도 않는다, 있는 그대로 한 줄.";
    const data: PlanResponse = {
      ...DATA,
      askRequests: [
        {
          id: 7,
          project: "alpha",
          batchSummary: "…",
          question: "정말 무관한지 봐 달라",
          answer,
          done: true,
          updatedAt: "2026-08-11T01:00:00.000Z",
        },
      ],
    };
    const { container } = renderPlan(data);
    expect(container.textContent).toContain(answer);
    expect(screen.getByText(/planner · 2026-08-11T01:00:00.000Z/)).toBeInTheDocument();
  });

  it("답을 기다리는 중이면 그 사실이 보인다", () => {
    const data: PlanResponse = {
      ...DATA,
      askRequests: [
        { id: 7, project: "alpha", batchSummary: "…", question: "정말 무관한지", answer: null, done: false, updatedAt: "t" },
      ],
    };
    renderPlan(data);
    expect(screen.getByText("답을 기다리는 중…")).toBeInTheDocument();
  });
});
