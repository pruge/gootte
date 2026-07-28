import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect } from "vitest";
import type { RoadmapResponse, TreeResponse } from "@gootte/contract";
import { RoadmapView } from "../src/components/plan/RoadmapView";
import { qk } from "../src/lib/query";

// auth-login 폴더 tree(문서 브라우저 2e) — 실제 파일 spec.md + 가상 todo/(l2 진행 · l1 완료).
const TREE: TreeResponse = {
  project: "alpha",
  initiative: "auth-login",
  nodes: [
    { name: "spec.md", type: "file", path: "spec.md", read: { source: "roadmap", initiative: "auth-login", relPath: "spec.md" }, badge: null },
    { name: "todo", type: "dir", path: "todo", badge: null },
    { name: "l2.md", type: "file", path: "todo/l2", read: { source: "todo", name: "l2" }, badge: "진행" },
    { name: "l1.md", type: "file", path: "todo/l1", read: { source: "todo", name: "l1" }, badge: "완료" },
  ],
};

const DATA: RoadmapResponse = {
  project: "alpha",
  items: [
    {
      initiative: "auth-login",
      track: { key: "A", label: "인증" },
      status: "active",
      done: ["l1"],
      pending: ["l2"],
    },
    {
      initiative: "device-read",
      track: { key: "B", label: "디바이스" },
      status: "active",
      done: ["d1"],
      pending: ["d2", "d3"],
    },
    {
      initiative: "auth-core",
      track: { key: "A", label: "인증" },
      status: "shipped",
      done: ["a1", "a2"],
      pending: [],
    },
  ],
  trackOrder: ["A", "B"],
};

function renderRoadmap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(qk.roadmap("alpha"), DATA);
  return render(
    <QueryClientProvider client={qc}>
      <RoadmapView project="alpha" />
    </QueryClientProvider>,
  );
}

function renderRoadmapWithWorktrees() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(qk.roadmap("alpha"), DATA);
  qc.setQueryData(qk.worktree("alpha"), {
    project: "alpha",
    worktrees: [
      {
        slug: "wt-auth",
        branch: "worktree-wt-auth",
        base: "abc",
        initiative: "auth-login", // track A
        sprint: null,
        signal: { mainCommitsSince: 0, overlapFiles: [], conflictRisk: "low" },
      },
    ],
  });
  return render(
    <QueryClientProvider client={qc}>
      <RoadmapView project="alpha" />
    </QueryClientProvider>,
  );
}

describe("RoadmapView (018 — 대분류 사이드바 + 진행/완료 탭)", () => {
  it("대분류 사이드바 + 기본 선택(첫 track A) 진행 탭", () => {
    renderRoadmap();
    expect(screen.getByRole("navigation", { name: "대분류" })).toBeInTheDocument();
    // 기본 = A(인증) 진행 탭 → auth-login 보임, auth-core(완료)·device-read(다른 track) 숨김
    expect(screen.getByText("auth-login")).toBeInTheDocument();
    expect(screen.queryByText("auth-core")).not.toBeInTheDocument();
    expect(screen.queryByText("device-read")).not.toBeInTheDocument();
  });

  it("완료 탭 클릭 → 그 track 의 shipped 이니셔티브", () => {
    renderRoadmap();
    fireEvent.click(screen.getByRole("tab", { name: /완료/ }));
    expect(screen.getByText("auth-core")).toBeInTheDocument();
    expect(screen.queryByText("auth-login")).not.toBeInTheDocument();
  });

  it("대분류 클릭 → 그 track 이니셔티브로 전환", () => {
    renderRoadmap();
    fireEvent.click(screen.getByRole("button", { name: /디바이스/ }));
    expect(screen.getByText("device-read")).toBeInTheDocument();
    expect(screen.queryByText("auth-login")).not.toBeInTheDocument();
  });

  it("이니셔티브 클릭 → 문서 브라우저(기본 = 가상 todo/ 폴더 = 할일) → 상위 cd → 형제 문서", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    qc.setQueryData(qk.roadmap("alpha"), DATA);
    qc.setQueryData(qk.tree("alpha", "auth-login"), TREE);
    render(
      <QueryClientProvider client={qc}>
        <RoadmapView project="alpha" />
      </QueryClientProvider>,
    );
    expect(screen.queryByText("l2.md")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /auth-login/ }));
    // 기본 진입 = 가상 todo/ → 할일 파일(badge 진행/완료)
    expect(screen.getByText("l1.md")).toBeInTheDocument();
    expect(screen.getByText("l2.md")).toBeInTheDocument();
    // ../ 로 상위 cd → 형제 실제 문서(spec.md)
    fireEvent.click(screen.getByRole("button", { name: "../" }));
    expect(screen.getByText("spec.md")).toBeInTheDocument();
    expect(screen.queryByText("l1.md")).not.toBeInTheDocument();
  });

  it("사이드바에 track별 진행·완료 카운트", () => {
    renderRoadmap();
    // track A: 진행 1(auth-login) · 완료 1(auth-core)
    expect(screen.getByText("진행 1 · 완료 1")).toBeInTheDocument();
    // track B: 진행 1(device-read) · 완료 0
    expect(screen.getByText("진행 1 · 완료 0")).toBeInTheDocument();
  });

  it("사이드바에 track별 작업중(활성 worktree) 카운트 — 해당 track 만", () => {
    renderRoadmapWithWorktrees();
    // worktree 가 auth-login(track A)에 바인딩 → track A 버튼에 '작업중 1', track B 엔 없음
    const trackA = screen.getByRole("button", { name: /인증/ });
    const trackB = screen.getByRole("button", { name: /디바이스/ });
    expect(within(trackA).getByText("작업중 1")).toBeInTheDocument();
    expect(within(trackB).queryByText(/작업중/)).not.toBeInTheDocument();
  });

  it("진행 탭 — worktree 도는 항목만 '작업중', 나머지 active 는 '진행'", () => {
    renderRoadmapWithWorktrees();
    // 기본 = track A 진행 탭. auth-login = worktree 바인딩 → '작업중'
    const authRow = screen.getByText("auth-login").closest("li")!;
    expect(within(authRow).getByText("작업중")).toBeInTheDocument();
    expect(within(authRow).queryByText("진행")).not.toBeInTheDocument();
    // track B(device-read) = active 지만 worktree 없음 → '진행' 유지
    fireEvent.click(screen.getByRole("button", { name: /디바이스/ }));
    const devRow = screen.getByText("device-read").closest("li")!;
    expect(within(devRow).getByText("진행")).toBeInTheDocument();
    expect(within(devRow).queryByText("작업중")).not.toBeInTheDocument();
  });

  it("작업중 탭 → 선택 track 의 worktree 만", () => {
    renderRoadmapWithWorktrees();
    // 기본 = track A. 작업중 탭 클릭 → auth 카드 보임
    fireEvent.click(screen.getByRole("tab", { name: /작업중/ }));
    expect(screen.getByText("wt-auth")).toBeInTheDocument();
    // track B 로 전환 → 그 track 작업중 없음
    fireEvent.click(screen.getByRole("button", { name: /디바이스/ }));
    fireEvent.click(screen.getByRole("tab", { name: /작업중/ }));
    expect(screen.queryByText("wt-auth")).not.toBeInTheDocument();
    expect(screen.getByText(/worktree 가 없습니다/)).toBeInTheDocument();
  });

  it("브라우저 파일 클릭 → 문서 뷰어(dialog) + 보기 모드 마크다운 렌더 + raw 토글", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    qc.setQueryData(qk.roadmap("alpha"), DATA);
    qc.setQueryData(qk.tree("alpha", "auth-login"), TREE);
    qc.setQueryData(qk.doc("alpha", "todo", "l1"), {
      project: "alpha",
      kind: "todo",
      name: "l1",
      path: "docs/todo/l1.md",
      archived: false,
      content: "---\nstatus: pending\n---\n# l1 제목\n본문 라인 하나",
    });
    render(
      <QueryClientProvider client={qc}>
        <RoadmapView project="alpha" />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /auth-login/ })); // 펼침 → 기본 todo/
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /l1\.md/ })); // 할일 파일 클릭
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("tab", { name: "raw" })).toBeInTheDocument();
    // 보기 모드 = 마크다운 렌더(lazy) — 제목이 heading 으로, 프론트마터는 숨김
    expect(await within(dialog).findByRole("heading", { name: "l1 제목" })).toBeInTheDocument();
    expect(within(dialog).queryByText(/status: pending/)).not.toBeInTheDocument();
    // raw 토글 → 원문(프론트마터 포함)
    fireEvent.click(within(dialog).getByRole("tab", { name: "raw" }));
    expect(within(dialog).getByText(/status: pending/)).toBeInTheDocument();
  });

  it("상위 cd 후 roadmap 파일(spec.md) 클릭 → roadmap 소스 read 로 뷰어", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    qc.setQueryData(qk.roadmap("alpha"), DATA);
    qc.setQueryData(qk.tree("alpha", "auth-login"), TREE);
    // roadmap 소스 캐시키 = ["doc", slug, "roadmap", initiative, relPath]
    qc.setQueryData(["doc", "alpha", "roadmap", "auth-login", "spec.md"], {
      project: "alpha",
      kind: "roadmap",
      name: "spec.md",
      path: "docs/roadmap/pm/auth-login/spec.md",
      archived: false,
      content: "# auth-login spec\n설계 본문",
    });
    render(
      <QueryClientProvider client={qc}>
        <RoadmapView project="alpha" />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /auth-login/ })); // 펼침 → todo/
    fireEvent.click(screen.getByRole("button", { name: "../" })); // 루트로 cd
    fireEvent.click(screen.getByRole("button", { name: /spec\.md/ })); // roadmap 파일 클릭
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByRole("heading", { name: "auth-login spec" })).toBeInTheDocument();
  });
});
