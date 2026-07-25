import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, beforeEach } from "vitest";
import type { TimelineResponse } from "@gootte/contract";
import { TimelineView } from "../src/components/timeline/TimelineView";
import { qk } from "../src/lib/query";

// C(제어)·F(실시간) 그룹 + 미분류(delta) — trackOrder = 서버 순서(미분류 last).
const DATA: TimelineResponse = {
  project: "alpha",
  from: "2026-07-05",
  to: "2026-07-25",
  rows: [
    {
      initiative: "auth-hardening",
      track: { key: "C", label: "제어 알고리즘" },
      bars: [{ kind: "sprint", label: "jwt-rotate", start: "2026-07-06", end: "2026-07-12" }],
      markers: [{ at: "2026-07-05", kind: "kickoff", label: "auth-hardening" }],
    },
    {
      initiative: "gateway-restructure",
      track: { key: "F", label: "실시간" },
      bars: [{ kind: "sprint", label: "relay-split", start: "2026-07-18", end: "2026-07-24" }],
      markers: [{ at: "2026-07-17", kind: "re-kickoff", label: "gateway-restructure" }],
    },
    {
      initiative: "weather-report",
      track: null,
      bars: [{ kind: "sprint", label: "wr-1", start: "2026-07-10", end: "2026-07-14" }],
      markers: [],
    },
  ],
  trackOrder: ["C", "F", "__ungrouped__"],
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

describe("TimelineView (대분류 그룹 Gantt)", () => {
  beforeEach(() => localStorage.clear());

  it("이니셔티브 행 = 라벨", () => {
    renderTimeline();
    expect(screen.getByText("auth-hardening")).toBeInTheDocument();
    expect(screen.getByText("gateway-restructure")).toBeInTheDocument();
  });

  it("sprint 바 = 날짜 tooltip + 라벨", () => {
    renderTimeline();
    expect(screen.getByTitle("jwt-rotate · 2026-07-06 ~ 2026-07-12")).toBeInTheDocument();
  });

  it("kickoff(●)·re-kickoff(▲) 마커 구분", () => {
    renderTimeline();
    expect(screen.getByLabelText("kickoff 2026-07-05")).toBeInTheDocument();
    expect(screen.getByLabelText("re-kickoff 2026-07-17")).toBeInTheDocument();
  });

  it("대분류 그룹 = 좌측 라벨 셀(trackOrder 순, 미분류 last)", () => {
    const { container } = renderTimeline();
    const groups = [...container.querySelectorAll("[data-track-group]")].map((e) =>
      e.getAttribute("data-track-group"),
    );
    expect(groups).toEqual(["C", "F", "__ungrouped__"]); // 서버 trackOrder 순
    expect(screen.getByLabelText("제어 알고리즘")).toBeInTheDocument();
    expect(screen.getByLabelText("미분류")).toBeInTheDocument();
  });

  it("hover 시 그 행 + 소속 그룹 라벨 셀 co-highlight(data-active 토글)", () => {
    const { container } = renderTimeline();
    const row = container.querySelector('[data-track-row="auth-hardening"]')!;
    const groupC = container.querySelector('[data-track-group="C"]')!;
    const groupF = container.querySelector('[data-track-group="F"]')!;
    expect(row.getAttribute("data-active")).toBe("false");
    expect(groupC.getAttribute("data-active")).toBe("false");

    fireEvent.mouseEnter(row);
    expect(row.getAttribute("data-active")).toBe("true"); // 그 행
    expect(groupC.getAttribute("data-active")).toBe("true"); // 소속 그룹(C)
    expect(groupF.getAttribute("data-active")).toBe("false"); // 타 그룹 무영향

    fireEvent.mouseLeave(row);
    expect(row.getAttribute("data-active")).toBe("false");
    expect(groupC.getAttribute("data-active")).toBe("false");
  });

  it("컬럼 폭 = 프로젝트별 localStorage 복원", () => {
    localStorage.setItem("gootte:timeline:cols:alpha", JSON.stringify({ groupW: 200, initW: 260 }));
    const { container } = renderTimeline();
    const groupCell = container.querySelector('[data-track-group="C"]') as HTMLElement;
    const initCell = container.querySelector('[data-track-row="auth-hardening"] > div') as HTMLElement;
    expect(groupCell.style.width).toBe("200px");
    expect(initCell.style.width).toBe("260px");
    // 다른 프로젝트 키에는 안 씀(격리) — alpha 키만 존재.
    expect(localStorage.getItem("gootte:timeline:cols:beta")).toBeNull();
  });

  it("저장값 없으면 기본 폭(112/176)", () => {
    const { container } = renderTimeline();
    const groupCell = container.querySelector('[data-track-group="C"]') as HTMLElement;
    expect(groupCell.style.width).toBe("112px");
  });

  it("날짜 없음(from/to null) = 빈 상태", () => {
    renderTimeline({ project: "alpha", from: null, to: null, rows: [], trackOrder: [] });
    expect(screen.getByText(/타임라인을 그릴 수 없습니다/)).toBeInTheDocument();
  });
});
