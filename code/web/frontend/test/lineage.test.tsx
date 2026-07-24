import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect } from "vitest";
import type { LineageResponse } from "@gootte/contract";
import { LineageView } from "../src/components/lineage/LineageView";
import { qk } from "../src/lib/query";

const DATA: LineageResponse = {
  project: "alpha",
  edges: [
    {
      from: "old-approach",
      to: "new-approach",
      kind: "supersede-partial",
      note: "부분 유지 — 코어 재사용",
      adr: ["ADR-0003"],
    },
    { from: "ghost-house", to: "space", kind: "supersede", note: "feature 은퇴", adr: [] },
    { from: "feat-a", to: "feat-b", kind: "dep" }, // 체인에서 제외돼야
  ],
  drops: [
    {
      todo: "operator-badge",
      initiative: "old-approach",
      resolvedBy: "lan-direct 로 흡수",
      at: "2026-07-01",
    },
  ],
};

function renderLineage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(qk.lineage("alpha"), DATA);
  return render(
    <QueryClientProvider client={qc}>
      <LineageView project="alpha" />
    </QueryClientProvider>,
  );
}

describe("LineageView", () => {
  it("supersede 체인 = dep 제외(2), note verbatim + ADR 배지", () => {
    renderLineage();
    expect(screen.getByText(/supersede 체인 \(2\)/)).toBeInTheDocument();
    expect(screen.getByText("new-approach")).toBeInTheDocument();
    expect(screen.getByText("부분 유지 — 코어 재사용")).toBeInTheDocument();
    expect(screen.getByText("ADR-0003")).toBeInTheDocument();
    // dep 엣지의 to 는 체인에 없어야
    expect(screen.queryByText("feat-b")).not.toBeInTheDocument();
  });

  it("partial kind = '부분대체' 라벨", () => {
    renderLineage();
    expect(screen.getByText("부분대체")).toBeInTheDocument();
  });

  it("drop = todo → resolvedBy verbatim", () => {
    renderLineage();
    expect(screen.getByText(/drop \(1\)/)).toBeInTheDocument();
    expect(screen.getByText("operator-badge")).toBeInTheDocument();
    expect(screen.getByText("lan-direct 로 흡수")).toBeInTheDocument();
  });
});
