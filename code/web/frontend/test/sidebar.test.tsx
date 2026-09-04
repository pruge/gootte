import { render, screen, fireEvent, act } from "@testing-library/react";
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
   * 🔴 세 상태가 화면에서 서로 달라야 한다 — 섞이면 배지가 거짓말을 한다:
   *   3 = 남은 일 셋 · 0 = **다 끝났다** · 미설정 = **아직 안 세어봤다**(스피너).
   * 배지는 서버가 백그라운드로 채우므로(read-path-redesign/T03) 첫 1~2초는 미설정이다.
   * 그때 0 을 그리면 "다 끝났다" 는 거짓말이고, 칸을 비우면 "배지 없는 프로젝트" 로 보인다.
   */
  it("남은 일 배지 — 3 · 0 · 세는 중(스피너) 셋이 서로 다르게 보인다", () => {
    renderSeeded(<Sidebar selected={null} onSelect={() => {}} />, [
      { slug: "jinwooauto", path: "/home/ai/jinwooauto", copies: ["/home/ai/jinwooauto"], openFeatures: 3 },
      { slug: "tuya", path: "/home/ai/tuya", copies: ["/home/ai/tuya"], openFeatures: 0 },
      { slug: "unknown", path: "/home/ai/unknown", copies: ["/home/ai/unknown"] },
    ]);
    expect(screen.getByRole("button", { name: /jinwooauto/ })).toHaveTextContent("3");
    const tuya = screen.getByRole("button", { name: /tuya/ });
    expect(tuya.querySelector("span[title]")?.textContent).toBe("0");

    // 🔴 미설정은 **즉시 스피너가 아니다** — 보통 1~2초 안에 값이 오므로 바로 띄우면
    // 떴다 사라지는 깜빡임만 남는다(캡틴 피드백 2026-09-04). 3초를 넘겨야 뜬다.
    const unknown = screen.getByRole("button", { name: /unknown/ });
    expect(unknown.querySelector("span[role='status']")).toBeNull();
    // 🔴 그 사이에도 숫자를 그리면 안 된다(특히 "0" — "다 끝났다" 는 거짓말이 된다).
    expect(unknown).not.toHaveTextContent("0");
  });

  it("🔴 값이 3초 넘게 안 오면 그때 스피너가 뜬다 — 숫자는 여전히 안 그린다", async () => {
    vi.useFakeTimers();
    try {
      renderSeeded(<Sidebar selected={null} onSelect={() => {}} />, [
        { slug: "unknown", path: "/home/ai/unknown", copies: ["/home/ai/unknown"] },
      ]);
      const btn = () => screen.getByRole("button", { name: /unknown/ });
      expect(btn().querySelector("span[role='status']")).toBeNull();
      await act(async () => {
        vi.advanceTimersByTime(3_100);
      });
      const badge = btn().querySelector("span[role='status']");
      expect(badge).not.toBeNull();
      expect(badge?.textContent ?? "").not.toMatch(/\d/);
      expect(btn()).not.toHaveTextContent("0");
    } finally {
      vi.useRealTimers();
    }
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
