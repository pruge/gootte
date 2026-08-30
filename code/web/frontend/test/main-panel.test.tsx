import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MainPanel } from "../src/components/main/MainPanel";

// 자식 뷰는 모의한다 — 이 테스트는 셸(토글·타이틀·배치)만 검증(T01).
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

function renderMain(project: string | null = "jinwooauto") {
  return render(
    <MainPanel project={project} tab="features" onTab={() => {}} view={null} onView={() => {}} />,
  );
}

describe("MainPanel settings toggle (T01)", () => {
  it("초기엔 설정 닫힘 — 프로젝트명과 탭·뷰가 보인다", () => {
    renderMain();
    expect(screen.getByRole("heading", { name: "jinwooauto" })).toBeInTheDocument();
    expect(screen.getByTestId("features-view")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "설정" })).toHaveAttribute("aria-expanded", "false");
  });

  it("gear 클릭 → SettingsView + 헤더 타이틀 'Settings'", () => {
    renderMain();
    fireEvent.click(screen.getByRole("button", { name: "설정" }));
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByTestId("settings-view")).toBeInTheDocument();
    // 탭은 설정 열리면 안 보인다
    expect(screen.queryByTestId("features-view")).not.toBeInTheDocument();
  });

  it("gear 재클릭 → 프로젝트명 + 원래 뷰 복귀", () => {
    renderMain();
    const gear = screen.getByRole("button", { name: "설정" });
    fireEvent.click(gear);
    fireEvent.click(gear);
    expect(screen.getByRole("heading", { name: "jinwooauto" })).toBeInTheDocument();
    expect(screen.getByTestId("features-view")).toBeInTheDocument();
    expect(screen.queryByTestId("settings-view")).not.toBeInTheDocument();
  });

  it("프로젝트 미선택 상태에서도 설정 열기 가능 (전역)", () => {
    renderMain(null);
    // 프로젝트 미선택 → 안내문
    expect(screen.getByText("왼쪽에서 프로젝트를 선택하세요.")).toBeInTheDocument();
    // gear 열기
    fireEvent.click(screen.getByRole("button", { name: "설정" }));
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByTestId("settings-view")).toBeInTheDocument();
  });

  it("설정이 dialog(role=dialog)가 아니라 본문 뷰로 렌더", () => {
    renderMain();
    fireEvent.click(screen.getByRole("button", { name: "설정" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("settings-view")).toBeInTheDocument();
  });

  it("설정 열린 채 프로젝트를 바꾸면(사이드바 클릭) 설정이 닫히고 그 프로젝트 뷰를 보여준다", () => {
    const { rerender } = renderMain("jinwooauto");
    fireEvent.click(screen.getByRole("button", { name: "설정" }));
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();

    // 사이드바에서 다른 프로젝트 선택 → project prop 변경 (App이 setProject로 이 값을 바꾼다)
    rerender(
      <MainPanel project="gootte" tab="features" onTab={() => {}} view={null} onView={() => {}} />,
    );
    expect(screen.getByRole("heading", { name: "gootte" })).toBeInTheDocument();
    expect(screen.getByTestId("features-view")).toBeInTheDocument();
    expect(screen.queryByTestId("settings-view")).not.toBeInTheDocument();
    // 탭도 다시 보인다
    expect(screen.getByRole("tab", { name: "features" })).toBeInTheDocument();
  });
});