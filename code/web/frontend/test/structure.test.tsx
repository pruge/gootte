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
      track: null, // 시스템/공통
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

describe("StructureView (구조 뷰)", () => {
  it("track 그룹 헤더 + 다이어그램 항목(리스트와 동축)", () => {
    renderView();
    expect(screen.getByText("시스템 / 공통")).toBeInTheDocument();
    expect(screen.getByText("웹 대시보드")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /데이터흐름/ })).toBeInTheDocument();
  });

  it("기본 포커스 = 첫 그림(헤더 렌더)", () => {
    renderView();
    const focus = screen.getByRole("article");
    expect(focus).toHaveTextContent("M-0001");
    expect(focus).toHaveTextContent("전체 아키텍처");
  });

  it("항목 클릭 → 포커스 전환", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /구 viz/ }));
    const focus = screen.getByRole("article");
    expect(focus).toHaveTextContent("M-0003");
    expect(focus).toHaveTextContent("superseded"); // 상태 칩
  });

  it("빈 그룹 → empty 상태", () => {
    renderView({ project: "alpha", groups: [] });
    expect(screen.getByText(/저장된 구조 다이어그램이 없습니다|저작된 구조 다이어그램이 없습니다/)).toBeInTheDocument();
  });
});
