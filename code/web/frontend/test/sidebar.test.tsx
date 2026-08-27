import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";
import type { Project } from "@gootte/contract";
import { Sidebar } from "../src/components/sidebar/Sidebar";
import { ThemeProvider } from "../src/theme/ThemeProvider";
import { qk } from "../src/lib/query";

const PROJECTS: Project[] = [
  { slug: "jinwooauto", path: "/home/ai/jinwooauto", copies: ["/home/ai/jinwooauto"] },
  { slug: "tuya", path: "/home/ai/tuya", copies: ["/home/ai/tuya"] },
];

function renderSeeded(ui: ReactElement, projects = PROJECTS) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(qk.projects, projects); // fetch 없이 캐시 시드
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>{ui}</ThemeProvider>
    </QueryClientProvider>,
  );
}

describe("Sidebar", () => {
  it("자동발견 프로젝트 목록 렌더 + 개수", () => {
    renderSeeded(<Sidebar selected={null} onSelect={() => {}} />);
    expect(screen.getByText("jinwooauto")).toBeInTheDocument();
    expect(screen.getByText("tuya")).toBeInTheDocument();
    expect(screen.getByText(/자동 발견 · 2개/)).toBeInTheDocument();
  });

  // firstmate-project-source 01 — 발견 규칙이 바뀐 뒤 캡틴이 실제로 보는 목록
  it("firstmate 프로젝트가 목록에 뜬다 (jinwooauto · gootte)", () => {
    renderSeeded(<Sidebar selected={null} onSelect={() => {}} />, [
      { slug: "jinwooauto", path: "/Users/x/Documents/ai2/projects/jinwooauto", copies: ["/Users/x/Documents/ai2/projects/jinwooauto"] },
      { slug: "gootte", path: "/Users/x/Documents/ai2/projects/gootte", copies: ["/Users/x/Documents/ai2/projects/gootte"] },
    ]);
    // "gootte" 는 사이드바 제목에도 있어 역할로 좁힌다 — 목록 항목만 본다
    expect(screen.getByRole("button", { name: /jinwooauto/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /gootte/ })).toBeInTheDocument();
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

  /**
   * 🔴 0 을 감추지 않는다 — 감추면 "다 끝났다"(0)와 "안 세어봤다"(필드 미설정)가 같은 화면이 된다.
   * 서버가 안 실어준 프로젝트에만 배지가 없어야 한다.
   */
  it("남은 일 있는 기능 수 배지 — 0 도 표시하고, 미설정만 감춘다", () => {
    renderSeeded(<Sidebar selected={null} onSelect={() => {}} />, [
      { slug: "jinwooauto", path: "/home/ai/jinwooauto", copies: ["/home/ai/jinwooauto"], openFeatures: 3 },
      { slug: "tuya", path: "/home/ai/tuya", copies: ["/home/ai/tuya"], openFeatures: 0 },
      { slug: "unknown", path: "/home/ai/unknown", copies: ["/home/ai/unknown"] },
    ]);
    expect(screen.getByRole("button", { name: /jinwooauto/ })).toHaveTextContent("3");
    const tuya = screen.getByRole("button", { name: /tuya/ });
    expect(tuya.querySelector("span[title]")?.textContent).toBe("0");
    expect(
      screen.getByRole("button", { name: /unknown/ }).querySelector("span[title]"),
    ).toBeNull();
  });

  /**
   * 🔴 T01 — 사본이 있어도 slug 기준으로 한 번만 렌더되고(`key={p.slug}`), title 은 대표 경로.
   * 같은 slug 가 두 번 안 뜨는 것은 discover 가 묶어 내는 덕이지만, 여기선 key 와 title 이
   * 그 묶인 결과 위에서 올바르게 붙는지 본다.
   */
  it("사본(copies)이 있어도 slug 기준 한 번만 렌더되고 title 은 대표 경로", () => {
    renderSeeded(<Sidebar selected={null} onSelect={() => {}} />, [
      { slug: "dup", path: "/home/a/dup", copies: ["/home/a/dup", "/work/b/dup"] },
    ]);
    const btn = screen.getByRole("button", { name: /dup/ });
    expect(btn).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /dup/ })).toHaveLength(1);
    expect(btn).toHaveAttribute("title", "/home/a/dup");
  });
});
