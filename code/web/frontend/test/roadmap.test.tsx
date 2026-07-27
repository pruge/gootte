import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect } from "vitest";
import type { RoadmapResponse } from "@gootte/contract";
import { RoadmapView } from "../src/components/plan/RoadmapView";
import { qk } from "../src/lib/query";

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

  it("이니셔티브 클릭 → 할일 체크리스트 펼침(한일☑/남은☐)", () => {
    renderRoadmap();
    expect(screen.queryByText("l2")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /auth-login/ }));
    expect(screen.getByText("l1")).toBeInTheDocument();
    expect(screen.getByText("l2")).toBeInTheDocument();
  });

  it("사이드바에 track별 진행·완료 카운트", () => {
    renderRoadmap();
    // track A: 진행 1(auth-login) · 완료 1(auth-core)
    expect(screen.getByText("진행 1 · 완료 1")).toBeInTheDocument();
    // track B: 진행 1(device-read) · 완료 0
    expect(screen.getByText("진행 1 · 완료 0")).toBeInTheDocument();
  });

  it("할일 클릭 → 문서 뷰어(dialog) + 보기 모드 마크다운 렌더 + raw 토글", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    qc.setQueryData(qk.roadmap("alpha"), DATA);
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
    fireEvent.click(screen.getByRole("button", { name: /auth-login/ })); // 펼침
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "l1" })); // 할일 클릭
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("tab", { name: "raw" })).toBeInTheDocument();
    // 보기 모드 = 마크다운 렌더(lazy) — 제목이 heading 으로, 프론트마터는 숨김
    expect(await within(dialog).findByRole("heading", { name: "l1 제목" })).toBeInTheDocument();
    expect(within(dialog).queryByText(/status: pending/)).not.toBeInTheDocument();
    // raw 토글 → 원문(프론트마터 포함)
    fireEvent.click(within(dialog).getByRole("tab", { name: "raw" }));
    expect(within(dialog).getByText(/status: pending/)).toBeInTheDocument();
  });
});
