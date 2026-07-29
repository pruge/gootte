import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect } from "vitest";
import type { StructureResponse } from "@gootte/contract";
import { StructureView } from "../src/components/structure/StructureView";
import { qk } from "../src/lib/query";

const DATA: StructureResponse = {
  project: "alpha",
  groups: [
    {
      track: null, // 시스템/공통 (groups[0] = 기본 선택)
      diagrams: [
        { id: "M-0001", title: "전체 아키텍처", status: "living", code: "flowchart TB\n a-->b", sources: ["blueprint.md"] },
      ],
    },
    {
      track: { key: "W", label: "웹 대시보드" },
      diagrams: [
        { id: "M-0002", title: "데이터흐름", status: "living", code: "flowchart LR\n x-->y", sources: [] },
        { id: "M-0003", title: "구 viz", status: "superseded", code: "flowchart LR\n p-->q", sources: [] },
      ],
    },
  ],
};

function renderView(data: StructureResponse = DATA) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(qk.structure("alpha"), data);
  return render(
    <QueryClientProvider client={qc}>
      <StructureView project="alpha" />
    </QueryClientProvider>,
  );
}

describe("StructureView (구조 뷰 — 사이드바 + 목록 + 드로어)", () => {
  it("좌측 공유 track 사이드바 = 그룹 + 그림 수", () => {
    renderView();
    const nav = screen.getByRole("navigation", { name: "대분류" });
    expect(nav).toHaveTextContent("시스템 / 공통");
    expect(nav).toHaveTextContent("웹 대시보드");
    expect(nav).toHaveTextContent("그림 2"); // W 그룹 = 2장
  });

  it("본문 = 선택 track 의 다이어그램 목록(기본 = 첫 그룹)", () => {
    renderView();
    expect(screen.getByRole("button", { name: /전체 아키텍처/ })).toBeInTheDocument();
    // 드로어는 아직 안 열림
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("사이드바 track 전환 → 그 track 목록", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /웹 대시보드/ }));
    expect(screen.getByRole("button", { name: /데이터흐름/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /구 viz/ })).toBeInTheDocument();
  });

  it("목록 클릭 → 드로어(뷰어) 오픈", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /웹 대시보드/ }));
    fireEvent.click(screen.getByRole("button", { name: /구 viz/ }));
    const dialog = screen.getByRole("dialog", { name: /M-0003/ });
    expect(dialog).toHaveTextContent("구 viz");
    expect(dialog).toHaveTextContent("superseded");
  });

  it("ESC → 드로어 닫힘", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /전체 아키텍처/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("빈 그룹 → empty 상태", () => {
    renderView({ project: "alpha", groups: [] });
    expect(screen.getByText(/저작된 구조 다이어그램이 없습니다/)).toBeInTheDocument();
  });
});
