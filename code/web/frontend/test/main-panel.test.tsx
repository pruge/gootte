import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import type { ReactElement } from "react";
import type { Tab } from "../src/hooks/useUrlState";
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
vi.mock("../src/components/memo/MemoView", () => ({
  MemoView: () => <div data-testid="memo-view">MemoView</div>,
}));

/**
 * 설정 열림은 이제 셸(App)이 들고 있다 — 이 하네스가 그 자리를 흉내낸다.
 * `settingsOpen` 은 prop 이 아니라 로컬 상태이고, gear 클릭 → `onSettingsOpenChange` → 상태 변경
 * → 재렌더가 실제로 일어난다. `onSettingsOpenChange` 는 기록도 남겨 ESC 테스트가 쓴다.
 */
function renderMain(project: string | null = "jinwooauto", initialSettingsOpen = false) {
  const onSettingsOpenChange = vi.fn();
  function Harness({ project: p }: { project: string | null }) {
    const [open, setOpen] = useState(initialSettingsOpen);
    const [tab, setTab] = useState<Tab>("features");
    const change = (next: boolean) => {
      onSettingsOpenChange(next);
      setOpen(next);
    };
    return (
      <MainPanel
        project={p}
        tab={tab}
        onTab={setTab}
        view={null}
        onView={() => {}}
        settingsOpen={open}
        onSettingsOpenChange={change}
      />
    );
  }
  const view = render(<Harness project={project} />);
  return { ...view, onSettingsOpenChange };
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
    // App 이 handleSelectProject 로 settingsOpen=false 를 먼저 부른 뒤 project 를 바꾼다.
    // MainPanel 은 그 prop 변경을 그대로 그릴 뿐이다 — "닫는 행위" 의 주체는 App.
    render(
      <MainPanel
        project="gootte"
        tab="features"
        onTab={() => {}}
        view={null}
        onView={() => {}}
        settingsOpen={false}
        onSettingsOpenChange={() => {}}
      />,
    );
    expect(screen.getByRole("heading", { name: "gootte" })).toBeInTheDocument();
    expect(screen.getByTestId("features-view")).toBeInTheDocument();
    expect(screen.queryByTestId("settings-view")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "features" })).toBeInTheDocument();
  });

  it("설정 열린 채 ESC 를 누르면 onSettingsOpenChange(false) 가 불린다 — 설정이 닫힌다", () => {
    const { onSettingsOpenChange } = renderMain("jinwooauto", true);
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onSettingsOpenChange).toHaveBeenCalledWith(false);
  });

  it("설정이 닫혀 있을 때 ESC 를 눌러도 아무 일도 안 한다", () => {
    const { onSettingsOpenChange } = renderMain("jinwooauto", false);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onSettingsOpenChange).not.toHaveBeenCalled();
  });

  it("memo 탭이면 MemoView 가 렌더된다 — memo-pad 는 프로젝트별 고유 키로 붙는다", () => {
    render(
      <MainPanel
        project="jinwooauto"
        tab="memo"
        onTab={() => {}}
        view={null}
        onView={() => {}}
        settingsOpen={false}
        onSettingsOpenChange={() => {}}
      />,
    );
    expect(screen.getByTestId("memo-view")).toBeInTheDocument();
    expect(screen.queryByTestId("features-view")).not.toBeInTheDocument();
    // 탭 줄에 memo 가 있다
    expect(screen.getByRole("tab", { name: "memo" })).toBeInTheDocument();
  });
});