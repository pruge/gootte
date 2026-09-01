import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import type { Project } from "@gootte/contract";
import { App } from "../src/App";
import { ThemeProvider } from "../src/theme/ThemeProvider";
import { qk } from "../src/lib/query";

// URL 기반 훅은 mock — 프로젝트 선택 상태를 실제로 바꿔 App 의 설정 닫기 동작을 검증한다.
vi.mock("../src/hooks/useUrlState", () => ({
  useUrlState: () => {
    const [project, setProject] = useState<string | null>("jinwooauto");
    return {
      project,
      tab: "features",
      view: null,
      doc: null,
      focus: null,
      setProject,
      setTab: vi.fn(),
      setView: vi.fn(),
      setDoc: vi.fn(),
      goToPlanFeature: vi.fn(),
    };
  },
}));

// 키보드 네비게이션은 테스트 범위 밖
vi.mock("../src/hooks/useKeyboardNav", () => ({
  useKeyboardNav: () => {},
}));

// 자식 뷰는 모의 — MainPanel 의 셸만 검증한다
vi.mock("../src/components/settings/SettingsView", () => ({
  SettingsView: () => <div data-testid="settings-view">SettingsView</div>,
}));
vi.mock("../src/components/features/FeaturesView", () => ({
  FeaturesView: () => <div data-testid="features-view">FeaturesView</div>,
}));
vi.mock("../src/components/plan/PlanView", () => ({
  PlanView: () => <div data-testid="plan-view">PlanView</div>,
}));
vi.mock("../src/components/process/ProcessView", () => ({
  ProcessView: () => <div data-testid="process-view">ProcessView</div>,
}));
vi.mock("../src/components/memo/MemoView", () => ({
  MemoView: () => <div data-testid="memo-view">MemoView</div>,
}));

const PROJECTS: Project[] = [
  { slug: "jinwooauto", path: "/home/ai/jinwooauto", copies: ["/home/ai/jinwooauto"] },
  { slug: "gootte", path: "/home/ai/gootte", copies: ["/home/ai/gootte"] },
];

function renderApp() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(qk.projects, PROJECTS);
  return render(
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <App />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe("App — settings 열기·닫기 (사이드바 클릭·ESC)", () => {
  it("설정 열기 → gear 클릭 → SettingsView + 'Settings' 헤더", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "설정" }));
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByTestId("settings-view")).toBeInTheDocument();
  });

  it("🔴 설정 열린 상태에서 **같은 프로젝트**를 클릭해도 닫힌다 — 새 프로젝트뿐 아니라", () => {
    renderApp();
    // 설정 연다
    fireEvent.click(screen.getByRole("button", { name: "설정" }));
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();

    // 같은 프로젝트(jinwooauto) 클릭 → 설정이 닫히고 그 프로젝트 뷰가 보인다
    const jinwooBtn = screen.getByRole("button", { name: /jinwooauto/ });
    fireEvent.click(jinwooBtn);
    expect(screen.getByRole("heading", { name: "jinwooauto" })).toBeInTheDocument();
    expect(screen.getByTestId("features-view")).toBeInTheDocument();
    expect(screen.queryByTestId("settings-view")).not.toBeInTheDocument();
  });

  it("설정 열린 상태에서 다른 프로젝트를 클릭해도 닫힌다", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "설정" }));
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();

    // 다른 프로젝트(gootte) 클릭
    const gootteBtn = screen.getByRole("button", { name: /gootte/ });
    fireEvent.click(gootteBtn);
    expect(screen.getByRole("heading", { name: "gootte" })).toBeInTheDocument();
    expect(screen.getByTestId("features-view")).toBeInTheDocument();
    expect(screen.queryByTestId("settings-view")).not.toBeInTheDocument();
  });

  it("설정 열린 상태에서 ESC → 설정이 닫힌다", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "설정" }));
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("heading", { name: "jinwooauto" })).toBeInTheDocument();
    expect(screen.getByTestId("features-view")).toBeInTheDocument();
    expect(screen.queryByTestId("settings-view")).not.toBeInTheDocument();
  });
});