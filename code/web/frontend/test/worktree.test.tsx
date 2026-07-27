import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect } from "vitest";
import type { RoadmapResponse, WorktreeResponse } from "@gootte/contract";
import { RoadmapView } from "../src/components/plan/RoadmapView";
import { qk } from "../src/lib/query";

// worktree 들은 미분류(track 없음·미바인딩) — 미분류 그룹 하나에 모여 기본 선택됨.
const ROADMAP: RoadmapResponse = {
  project: "alpha",
  items: [{ initiative: "web-viz", track: null, status: "active", done: [], pending: ["x"] }],
  trackOrder: [],
};

const WT: WorktreeResponse = {
  project: "alpha",
  worktrees: [
    {
      slug: "auth-hardening",
      branch: "worktree-auth-hardening",
      base: "abc123",
      initiative: "auth",
      sprint: "2026-07-20-auth-hardening",
      signal: { mainCommitsSince: 12, overlapFiles: ["a.ts", "b.ts"], conflictRisk: "high" },
    },
    {
      slug: "no-sprint-wt",
      branch: "worktree-no-sprint",
      base: "def456",
      initiative: null,
      sprint: null,
      signal: { mainCommitsSince: 0, overlapFiles: [], conflictRisk: "low" },
    },
  ],
};

function renderView(wt: WorktreeResponse = WT) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(qk.roadmap("alpha"), ROADMAP);
  qc.setQueryData(qk.worktree("alpha"), wt);
  // worktree 트리의 라이브 sprint doc (card 가 wt.slug="auth-hardening" 로 요청)
  qc.setQueryData(qk.doc("alpha", "sprint", "2026-07-20-auth-hardening", "auth-hardening"), {
    project: "alpha",
    kind: "sprint",
    name: "2026-07-20-auth-hardening",
    path: ".claude/worktrees/auth-hardening/docs/sprint/2026-07-20-auth-hardening.md",
    archived: false,
    worktree: "auth-hardening",
    content: "# auth-hardening\n## 사용자 테스트\n- 확인 항목",
  });
  return render(
    <QueryClientProvider client={qc}>
      <RoadmapView project="alpha" />
    </QueryClientProvider>,
  );
}

describe("작업중(worktree) 탭 — RoadmapPanel 통합 (017)", () => {
  it("진행/완료 옆 '작업중' 탭 → 클릭 시 활성 worktree 카드", () => {
    renderView();
    fireEvent.click(screen.getByRole("tab", { name: /작업중/ }));
    expect(screen.getByText("auth-hardening")).toBeInTheDocument();
    expect(screen.getByText("auth")).toBeInTheDocument(); // initiative
    expect(screen.getByText("2026-07-20-auth-hardening")).toBeInTheDocument(); // sprint
    expect(screen.getByText("충돌 높음")).toBeInTheDocument();
  });

  it("활성 worktree 0 = 작업중 탭 빈 상태", () => {
    renderView({ project: "alpha", worktrees: [] });
    fireEvent.click(screen.getByRole("tab", { name: /작업중/ }));
    expect(screen.getByText(/진행 중인 worktree 가 없습니다/)).toBeInTheDocument();
  });

  it("sprint 있는 카드 클릭 → 그 worktree 의 sprint 문서(dialog, 라이브 버전)", async () => {
    renderView();
    fireEvent.click(screen.getByRole("tab", { name: /작업중/ }));
    fireEvent.click(screen.getByRole("button", { name: /auth-hardening/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("2026-07-20-auth-hardening")).toBeInTheDocument(); // 헤더 문서명
  });

  it("sprint 없는 worktree 카드는 비활성", () => {
    renderView();
    fireEvent.click(screen.getByRole("tab", { name: /작업중/ }));
    expect(screen.getByRole("button", { name: /no-sprint-wt/ })).toBeDisabled();
  });
});
