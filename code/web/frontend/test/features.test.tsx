import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect } from "vitest";
import type { FeaturesResponse } from "@gootte/contract";
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
          workedBy: [],
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
          workedBy: [],
        },
        {
          // 처리중 — 문서가 아니라 격리 사본 관측이 준 값이다. 원문 상태는 그대로 남는다.
          num: "05",
          slug: "05-oauth",
          title: "OAuth 교환",
          status: "in_progress",
          sourceStatus: "ready-for-agent",
          statusKnown: true,
          blockedBy: [],
          waitingOn: [],
          startable: true,
          workedBy: ["fm/alpha-oauth"],
        },
      ],
    },
  ],
};

function renderView(data: FeaturesResponse) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(qk.features("alpha"), data);
  return render(
    <QueryClientProvider client={qc}>
      <FeaturesView project="alpha" />
    </QueryClientProvider>,
  );
}
const renderFeatures = () => renderView(DATA);

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

  it("지금 붙들려 있는 티켓에만 처리중 표시가 붙는다 — 어느 가지가 붙들었는지까지", () => {
    renderFeatures();
    const working = screen.getByText("OAuth 교환").closest("li")!;
    expect(within(working).getByText(/처리중 · fm\/alpha-oauth/)).toBeInTheDocument();
    // 아무도 안 붙든 티켓에는 안 붙는다.
    const idle = screen.getByText("로그인 화면").closest("li")!;
    expect(within(idle).queryByText(/처리중/)).toBeNull();
    expect(screen.getByText(/처리중 1/)).toBeInTheDocument(); // 기능 머리말 집계
  });

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
