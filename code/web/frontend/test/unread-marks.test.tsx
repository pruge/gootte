import { useState } from "react";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import type { FeaturesResponse } from "@gootte/contract";

// 구관례 `issues/` 폴더 — issues 칸은 이 폴더가 실재할 때만 그려진다(FeatureTree 의 `{issues && ...}`, INV-4).
const ISSUES_DIR = { kind: "dir" as const, name: "issues", path: "issues", children: [] };
import { FeaturesView } from "../src/components/features/FeaturesView";
import { qk } from "../src/lib/query";
import * as api from "../src/lib/api";

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

/** 티켓 하나 — `unread` 값만 다르다. */
function ticket(overrides: { num: string; path: string; title: string; unread?: boolean }) {
  return {
    num: overrides.num,
    slug: overrides.path.replace(/^issues\//, "").replace(/\.md$/, ""),
    path: overrides.path,
    title: overrides.title,
    status: "pending" as const,
    sourceStatus: "ready-for-agent",
    statusKnown: true,
    blockedBy: [],
    unreadableBlockedBy: [],
    waitingOn: [],
    startable: true,
    needsCaptainEye: false,
    unread: overrides.unread,
  };
}

const UNREAD_DATA: FeaturesResponse = {
  project: "alpha",
  inProgress: NO_WORK,
  features: [
    {
      slug: "auth-login",
      title: "auth-login — 로그인",
      status: "pending",
      sourceStatus: "ready-for-agent",
      statusKnown: true,
      docs: [ISSUES_DIR],
      hasUnreadTicket: true,
      tickets: [
        ticket({ num: "01", path: "issues/01-session.md", title: "세션 발급", unread: false }),
        ticket({ num: "02", path: "issues/02-screen.md", title: "로그인 화면", unread: true }),
      ],
    },
  ],
};

const READ_DATA: FeaturesResponse = {
  ...UNREAD_DATA,
  features: [
    {
      ...UNREAD_DATA.features[0]!,
      hasUnreadTicket: false,
      tickets: UNREAD_DATA.features[0]!.tickets.map((t) => ({ ...t, unread: false })),
    },
  ],
};

function Harness({ initialView = null }: { initialView?: string | null }) {
  const [view, setView] = useState<string | null>(initialView);
  return <FeaturesView project="alpha" view={view} onView={setView} />;
}

function renderApp(data: FeaturesResponse) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(qk.features("alpha"), data);
  render(
    <QueryClientProvider client={qc}>
      <Harness />
    </QueryClientProvider>,
  );
  return qc;
}

function openCard(title: string): void {
  fireEvent.click(screen.getByRole("heading", { name: title }).closest("button")!);
}

describe("FeaturesView — 안 읽은 티켓 표시(unread-tickets-show-themselves/01)", () => {
  it("🔴 안 읽은 티켓만 '안 읽음' 표시가 붙는다", () => {
    renderApp(UNREAD_DATA);
    openCard("로그인");
    const read = screen.getByText("세션 발급").closest("li")!;
    const unread = screen.getByText("로그인 화면").closest("li")!;
    expect(read.querySelector("[role='status']")).toBeNull();
    expect(unread.textContent).toContain("안 읽음");
  });

  it("🔴 안 읽은 티켓이 있는 기능의 카드 머리글에도 '안 읽음' 표시가 붙는다", () => {
    renderApp(UNREAD_DATA);
    const header = screen.getByRole("heading", { name: "로그인" }).closest("div")!;
    expect(header.textContent).toContain("안 읽음");
  });

  it("모두 읽은 기능은 표시가 없다", () => {
    renderApp(READ_DATA);
    const header = screen.getByRole("heading", { name: "로그인" }).closest("div")!;
    expect(header.textContent).not.toContain("안 읽음");
    openCard("로그인");
    expect(screen.getByText("로그인 화면").closest("li")!.textContent).not.toContain("안 읽음");
  });
});

describe("FeaturesView — 티켓을 열면 읽음이 된다(01 §완료 시 시연 가능한 것)", () => {
  it("🔴 안 읽은 티켓을 열면 그 줄과 머리글의 표시가 풀린다", async () => {
    vi.spyOn(api, "fetchFeatureDoc").mockResolvedValue({
      path: "issues/02-screen.md",
      content: "# 문서 본문\n",
    });
    // 서버는 doc 요청을 받으면 읽음으로 적고, 다음 features 요청은 풀린 값을 돌려준다
    // (백엔드 라우트가 실제로 하는 일 — `backend/test/app.test.ts` §읽음 기록이 잰다).
    const fetchFeaturesSpy = vi.spyOn(api, "fetchFeatures").mockResolvedValue(READ_DATA);

    renderApp(UNREAD_DATA);
    openCard("로그인");
    const row = screen.getByText("로그인 화면").closest("li")!;
    expect(row.textContent).toContain("안 읽음");
    fireEvent.click(within(row).getByText("로그인 화면").closest("button")!);

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    await waitFor(() => expect(fetchFeaturesSpy).toHaveBeenCalled());
    await waitFor(() => {
      expect(within(row).getByText("로그인 화면").closest("li")!.textContent).not.toContain("안 읽음");
    });
    const header = screen.getByRole("heading", { name: "로그인" }).closest("div")!;
    expect(header.textContent).not.toContain("안 읽음");
  });
});
