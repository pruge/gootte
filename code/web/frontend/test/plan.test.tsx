import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect } from "vitest";
import type { PlanResponse } from "@gootte/contract";
import { PlanView } from "../src/components/plan/PlanView";
import { qk } from "../src/lib/query";

const DATA: PlanResponse = {
  project: "alpha",
  plan: [
    { order: 1, initiative: "auth-hardening", status: "active", now: true, subSteps: [], deps: [] },
    {
      order: 2,
      initiative: "misc-gateway",
      status: "planned",
      now: false,
      subSteps: ["field-device-hardening", "fsm-state-siteid"],
      deps: ["auth-hardening"],
    },
  ],
  rationale: [
    {
      initiative: "auth-hardening",
      priorityBasis: "의존 충족·다음 전선",
      delayCost: "인증 취약 누적",
      independence: null,
      stoppingPoint: null,
    },
  ],
  trackOrder: [],
};

function renderPlan() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(qk.plan("alpha"), DATA);
  return render(
    <QueryClientProvider client={qc}>
      <PlanView project="alpha" />
    </QueryClientProvider>,
  );
}

describe("PlanView", () => {
  it("순서대로 initiative 렌더 + NOW 마커", () => {
    renderPlan();
    expect(screen.getAllByText("auth-hardening").length).toBeGreaterThan(0); // plan + rationale
    expect(screen.getByText("misc-gateway")).toBeInTheDocument();
    expect(screen.getByText("NOW")).toBeInTheDocument();
  });

  it("subSteps(할일) + deps 렌더", () => {
    renderPlan();
    expect(screen.getByText("fsm-state-siteid")).toBeInTheDocument();
    expect(screen.getByText(/의존: auth-hardening/)).toBeInTheDocument();
  });

  it("'왜 이 순서' rationale verbatim(방치비용 포함)", () => {
    renderPlan();
    expect(screen.getByText(/왜 이 순서/)).toBeInTheDocument();
    expect(screen.getByText(/의존 충족·다음 전선/)).toBeInTheDocument();
    expect(screen.getByText(/인증 취약 누적/)).toBeInTheDocument();
  });
});
