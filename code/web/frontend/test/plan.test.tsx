import { useState } from "react";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect } from "vitest";
import type { PlanResponse } from "@gootte/contract";
import { PlanView } from "../src/components/plan/PlanView";
import { qk } from "../src/lib/query";

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
        updatedAt: "2026-08-11T00:00:00.000Z",
      },
      {
        project: "alpha",
        feature: "billing",
        ticket: "01",
        step: 1,
        kind: "planned",
        why: "막힘 확인용",
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
