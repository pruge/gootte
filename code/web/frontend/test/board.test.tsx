import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect } from "vitest";
import type { BoardResponse } from "@gootte/contract";
import { BoardView } from "../src/components/board/BoardView";
import { qk } from "../src/lib/query";

const DATA: BoardResponse = {
  project: "alpha",
  columns: [
    {
      key: "active",
      title: "ACTIVE",
      items: [{ order: 1, initiative: "auth-hardening", status: "active", now: true, subSteps: ["t1"], deps: [], track: { key: "G", label: "인증" } }],
    },
    {
      key: "ready",
      title: "READY",
      items: [{ order: 2, initiative: "misc-gateway", status: "planned", now: false, subSteps: [], deps: ["auth-hardening"], track: null }],
    },
    { key: "blocked", title: "BLOCKED", items: [] },
  ],
};

function renderBoard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(qk.board("alpha"), DATA);
  return render(
    <QueryClientProvider client={qc}>
      <BoardView project="alpha" />
    </QueryClientProvider>,
  );
}

describe("BoardView (칸반)", () => {
  it("3 파티션 컬럼 (라벨 = 카드 status 와 단어 충돌 회피)", () => {
    renderBoard();
    expect(screen.getByRole("region", { name: "진행 중" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "착수 가능" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "선행 대기" })).toBeInTheDocument();
  });

  it("카드 = 이니셔티브 + NOW 마커", () => {
    renderBoard();
    expect(screen.getByText("auth-hardening")).toBeInTheDocument();
    expect(screen.getByText("NOW")).toBeInTheDocument();
    expect(screen.getByText("misc-gateway")).toBeInTheDocument();
  });

  it("빈 컬럼 = '비어있음'", () => {
    renderBoard();
    const blocked = screen.getByRole("region", { name: "선행 대기" });
    expect(blocked).toHaveTextContent("비어있음");
  });

  it("카드 = 정규화 track 칩(key + label)", () => {
    renderBoard();
    expect(screen.getByText("G 인증")).toBeInTheDocument(); // {key} {label}
    expect(screen.getByTitle("대분류 G — 인증")).toBeInTheDocument();
  });
});
