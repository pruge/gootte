import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect } from "vitest";
import type { TimelineResponse } from "@gootte/contract";
import { TimelineView } from "../src/components/timeline/TimelineView";
import { qk } from "../src/lib/query";

const DATA: TimelineResponse = {
  project: "alpha",
  from: "2026-07-05",
  to: "2026-07-25",
  rows: [
    {
      initiative: "auth-hardening",
      bars: [{ kind: "sprint", label: "jwt-rotate", start: "2026-07-06", end: "2026-07-12" }],
      markers: [{ at: "2026-07-05", kind: "kickoff", label: "auth-hardening" }],
    },
    {
      initiative: "gateway-restructure",
      bars: [{ kind: "sprint", label: "relay-split", start: "2026-07-18", end: "2026-07-24" }],
      markers: [{ at: "2026-07-17", kind: "re-kickoff", label: "gateway-restructure" }],
    },
  ],
};

function renderTimeline(data: TimelineResponse = DATA) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(qk.timeline("alpha"), data);
  return render(
    <QueryClientProvider client={qc}>
      <TimelineView project="alpha" />
    </QueryClientProvider>,
  );
}

describe("TimelineView (CI 워터폴 Gantt)", () => {
  it("이니셔티브 행 = 라벨", () => {
    renderTimeline();
    expect(screen.getByText("auth-hardening")).toBeInTheDocument();
    expect(screen.getByText("gateway-restructure")).toBeInTheDocument();
  });

  it("sprint 바 = 날짜 tooltip + 라벨", () => {
    renderTimeline();
    expect(screen.getByText("jwt-rotate")).toBeInTheDocument();
    expect(screen.getByTitle("jwt-rotate · 2026-07-06 ~ 2026-07-12")).toBeInTheDocument();
  });

  it("kickoff(●)·re-kickoff(▲) 마커 구분", () => {
    renderTimeline();
    expect(screen.getByLabelText("kickoff 2026-07-05")).toBeInTheDocument();
    expect(screen.getByLabelText("re-kickoff 2026-07-17")).toBeInTheDocument();
  });

  it("날짜축 눈금(MM-DD) 렌더", () => {
    renderTimeline();
    expect(screen.getByText("07-05")).toBeInTheDocument();
    expect(screen.getByText("07-25")).toBeInTheDocument();
  });

  it("날짜 없음(from/to null) = 빈 상태", () => {
    renderTimeline({ project: "alpha", from: null, to: null, rows: [] });
    expect(screen.getByText(/타임라인을 그릴 수 없습니다/)).toBeInTheDocument();
  });
});
