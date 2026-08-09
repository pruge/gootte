import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect } from "vitest";
import type { FeaturesResponse } from "@gootte/contract";
import { FeaturesView } from "../src/components/features/FeaturesView";
import { qk } from "../src/lib/query";

// 서버가 계산까지 끝낸 값(startable·waitingOn) — 화면은 재계산하지 않는다(INV-1).
const DATA: FeaturesResponse = {
  project: "alpha",
  features: [
    {
      slug: "auth-login",
      title: "auth-login — 로그인",
      status: "pending",
      sourceStatus: "ready-for-agent",
      statusKnown: true,
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
        },
        {
          num: "03",
          slug: "03-social",
          title: "소셜 로그인",
          status: "pending",
          sourceStatus: "needs-info",
          statusKnown: true,
          blockedBy: ["02"],
          waitingOn: ["02"],
          startable: false,
        },
        {
          num: "04",
          slug: "04-mystery",
          title: "정체불명",
          status: "pending",
          sourceStatus: "진행중",
          statusKnown: false,
          blockedBy: [],
          waitingOn: [],
          startable: true,
        },
      ],
    },
  ],
};

function renderFeatures() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(qk.features("alpha"), DATA);
  return render(
    <QueryClientProvider client={qc}>
      <FeaturesView project="alpha" />
    </QueryClientProvider>,
  );
}

describe("FeaturesView — 기능별 할일 목록", () => {
  it("기능 제목과 티켓 목록이 뜬다", () => {
    renderFeatures();
    expect(screen.getByRole("heading", { name: "auth-login — 로그인" })).toBeInTheDocument();
    expect(screen.getByText("세션 발급")).toBeInTheDocument();
    expect(screen.getByText("로그인 화면")).toBeInTheDocument();
    expect(screen.getByText("소셜 로그인")).toBeInTheDocument();
  });

  it("선행이 남은 티켓은 무엇을 기다리는지 보이고, 풀린 티켓은 착수 가능으로 보인다", () => {
    renderFeatures();
    const blocked = screen.getByText("소셜 로그인").closest("li")!;
    expect(within(blocked).getByText("대기 → 02")).toBeInTheDocument();
    const ready = screen.getByText("로그인 화면").closest("li")!;
    expect(within(ready).getByText("착수 가능")).toBeInTheDocument();
  });

  it("원문 상태가 뭉개지지 않고 그대로 뜬다 — needs-info 와 blocked 를 구분할 수 있다", () => {
    renderFeatures();
    expect(screen.getByText("needs-info")).toBeInTheDocument();
    expect(screen.getByText("resolved")).toBeInTheDocument();
    expect(screen.getByText("2026-08-08")).toBeInTheDocument();
  });

  it("🔴 알 수 없는 상태의 티켓이 사라지지 않고, 무엇이 이상한지 드러난다", () => {
    renderFeatures();
    expect(screen.getByText("정체불명")).toBeInTheDocument();
    expect(screen.getByText(/알 수 없는 상태: 진행중/)).toBeInTheDocument();
  });

  it("기능이 없으면 빈 목록 안내", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    qc.setQueryData(qk.features("alpha"), { project: "alpha", features: [] });
    render(
      <QueryClientProvider client={qc}>
        <FeaturesView project="alpha" />
      </QueryClientProvider>,
    );
    expect(screen.getByText(/기능이 없습니다/)).toBeInTheDocument();
  });
});
