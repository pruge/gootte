import { useState } from "react";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import type { FeaturesResponse, FeatureTicket } from "@gootte/contract";
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
      docs: [],
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
          workedBy: [],
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
          workedBy: [],
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
          workedBy: [],
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
          workedBy: [],
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
          workedBy: ["fm/alpha-oauth"],
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
  onGoToPlanFeature = vi.fn(),
}: {
  project: string;
  initialView?: string | null;
  onGoToPlanFeature?: (feature: string) => void;
}) {
  const [view, setView] = useState<string | null>(initialView);
  return (
    <FeaturesView project={project} view={view} onView={setView} onGoToPlanFeature={onGoToPlanFeature} />
  );
}

function renderView(
  data: FeaturesResponse,
  initialView: string | null = null,
  opts: { onGoToPlanFeature?: (feature: string) => void } = {},
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(qk.features(data.project), data);
  return render(
    <QueryClientProvider client={qc}>
      <Harness project={data.project} initialView={initialView} {...opts} />
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
    workedBy: [],
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
          docs: [],
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

  it("선행이 남은 티켓은 무엇을 기다리는지 보이고, 풀린 티켓은 착수 가능으로 보인다", () => {
    renderFeatures();
    openCard("로그인");
    const blocked = screen.getByText("소셜 로그인").closest("li")!;
    expect(within(blocked).getByText("대기")).toBeInTheDocument();
    expect(within(blocked).getByText("→ 02")).toBeInTheDocument();
    const ready = screen.getByText("로그인 화면").closest("li")!;
    expect(within(ready).getByText("착수 가능")).toBeInTheDocument();
  });

  it("원문 상태가 뭉개지지 않고 그대로 뜬다 — needs-info 와 blocked 를 구분할 수 있다", () => {
    renderFeatures();
    openCard("로그인");
    expect(screen.getByText("needs-info")).toBeInTheDocument();
    expect(screen.getByText("resolved")).toBeInTheDocument();
    expect(screen.getByText("2026-08-08")).toBeInTheDocument();
  });

  it("🔴 알 수 없는 상태의 티켓이 사라지지 않고, 무엇이 이상한지 드러난다", () => {
    renderFeatures();
    openCard("로그인");
    expect(screen.getByText("정체불명")).toBeInTheDocument();
    expect(screen.getByText(/알 수 없는 상태: 진행중/)).toBeInTheDocument();
  });

  it("지금 붙들려 있는 티켓에만 진행중 단계가 붙는다 — 어느 가지가 붙들었는지까지", () => {
    renderFeatures();
    openCard("로그인");
    const working = screen.getByText("OAuth 교환").closest("li")!;
    expect(within(working).getByText("진행중")).toBeInTheDocument();
    expect(within(working).getByText("fm/alpha-oauth")).toBeInTheDocument();
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
          docs: [],
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
              workedBy: [],
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

// 🔴 첫 커버(development-order/16 ④) — features 탭 카드의 plan 버튼. 남은 일이 있으면 뜨고,
// 누르면 plan 탭 기능 보기, 그 기능이 있는 자리로 건너간다.
describe("FeaturesView — 남은 일이 있으면 plan 버튼이 뜬다(development-order/16 ④, 🔴 첫 커버)", () => {
  it("남은 일이 있는 기능(auth-login)엔 plan 버튼이 있다", () => {
    renderFeatures();
    expect(screen.getByRole("button", { name: "plan" })).toBeInTheDocument();
  });

  it("남은 일이 없으면(전부 done/dropped) 버튼이 없다", () => {
    const data: FeaturesResponse = {
      project: "alpha",
      inProgress: NO_WORK,
      features: [
        {
          slug: "done-feature",
          title: "done-feature — 다 끝남",
          status: "done",
          sourceStatus: "resolved",
          statusKnown: true,
          docs: [],
          tickets: [
            {
              num: "01",
              slug: "01-a",
              path: "issues/01-a.md",
              title: "끝난 것",
              status: "done",
              sourceStatus: "resolved",
              statusKnown: true,
              blockedBy: [],
              unreadableBlockedBy: [],
              waitingOn: [],
              startable: true,
              workedBy: [],
              needsCaptainEye: false,
            },
          ],
        },
      ],
    };
    renderView(data);
    expect(screen.queryByRole("button", { name: "plan" })).toBeNull();
  });

  it("누르면 onGoToPlanFeature 가 그 기능으로 불린다", () => {
    const onGoToPlanFeature = vi.fn();
    renderView(DATA, null, { onGoToPlanFeature });
    fireEvent.click(screen.getByRole("button", { name: "plan" }));
    expect(onGoToPlanFeature).toHaveBeenCalledWith("auth-login");
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
