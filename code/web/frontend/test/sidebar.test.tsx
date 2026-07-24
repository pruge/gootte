import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";
import type { Project } from "@gootte/contract";
import { Sidebar } from "../src/components/sidebar/Sidebar";
import { qk } from "../src/lib/query";

const PROJECTS: Project[] = [
  { slug: "jinwooauto", path: "/home/ai/jinwooauto" },
  { slug: "tuya", path: "/home/ai/tuya" },
];

function renderSeeded(ui: ReactElement, projects = PROJECTS) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(qk.projects, projects); // fetch 없이 캐시 시드
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("Sidebar", () => {
  it("자동발견 프로젝트 목록 렌더 + 개수", () => {
    renderSeeded(<Sidebar selected={null} onSelect={() => {}} />);
    expect(screen.getByText("jinwooauto")).toBeInTheDocument();
    expect(screen.getByText("tuya")).toBeInTheDocument();
    expect(screen.getByText(/자동 발견 · 2개/)).toBeInTheDocument();
  });

  it("클릭 시 onSelect(slug) 호출", () => {
    const onSelect = vi.fn();
    renderSeeded(<Sidebar selected={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("jinwooauto"));
    expect(onSelect).toHaveBeenCalledWith("jinwooauto");
  });

  it("선택된 프로젝트 = aria-current", () => {
    renderSeeded(<Sidebar selected="tuya" onSelect={() => {}} />);
    const active = screen.getByRole("button", { current: true });
    expect(active).toHaveTextContent("tuya");
  });
});
