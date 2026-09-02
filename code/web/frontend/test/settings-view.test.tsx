import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";
import { SettingsResponse, type SettingsResponse as SettingsResponseType } from "@gootte/contract";
import { SettingsView } from "../src/components/settings/SettingsView";
import { ThemeProvider } from "../src/theme/ThemeProvider";
import { qk } from "../src/lib/query";

vi.mock("../src/lib/api", () => ({
  fetchSettings: vi.fn(),
  saveSettings: vi.fn(),
  refreshBackend: vi.fn(),
}));

vi.mock("../src/lib/tauri", () => ({
  isTauri: vi.fn(() => true),
  pickFolder: vi.fn(),
}));

import { fetchSettings, refreshBackend, saveSettings } from "../src/lib/api";
import { pickFolder } from "../src/lib/tauri";

const mockFetch = vi.mocked(fetchSettings);
const mockSave = vi.mocked(saveSettings);
const mockRefresh = vi.mocked(refreshBackend);
const mockPickFolder = vi.mocked(pickFolder);

function settings(partial: Partial<SettingsResponseType>): SettingsResponseType {
  return SettingsResponse.parse({
    firstmateHome: null,
    firstmateHomeExists: false,
    firstmateHomeSuggestion: null,
    watchRoots: [],
    effectiveWatchRoots: [],
    ...partial,
  });
}

function renderView(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(qk.settings, settings({}));
  render(
    <QueryClientProvider client={qc}>
      <SettingsView />
    </QueryClientProvider>,
  );
}

/** 테마 카테고리는 `useTheme` 컨텍스트(ThemeProvider)를 필요로 한다 — 감싸서 렌더. */
function renderViewWithTheme(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(qk.settings, settings({}));
  render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <SettingsView />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("SettingsView — VSCode 레이아웃 (settings-in-main-area T02)", () => {
  it("좌측 레일에 검색창 + 카테고리(일반/감시/숨김/테마)가 보인다", () => {
    renderView();
    expect(screen.getByRole("searchbox", { name: "설정 검색" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /일반/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /감시/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /숨김/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /테마/ })).toBeInTheDocument();
  });

  it("기본 카테고리는 일반 — firstmate 홈 입력이 보인다", () => {
    renderView();
    expect(screen.getByLabelText("firstmate 홈 경로")).toBeInTheDocument();
  });

  it("카테고리 클릭 → 우측 폼 전환 (감시 → 감시 폴더 목록)", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /감시/ }));
    expect(screen.getByLabelText("감시 폴더 추가 경로")).toBeInTheDocument();
    expect(screen.queryByLabelText("firstmate 홈 경로")).not.toBeInTheDocument();
  });

  it("검색으로 카테고리 필터 — '감시' 입력하면 일반·숨김은 숨는다", () => {
    renderView();
    fireEvent.change(screen.getByRole("searchbox", { name: "설정 검색" }), {
      target: { value: "감시" },
    });
    expect(screen.getByRole("button", { name: /감시/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /일반/ })).not.toBeInTheDocument();
  });

  it("입력 변경 시 자동 저장 — 저장 버튼 없이 PUT 이 간다", async () => {
    renderView();
    mockSave.mockResolvedValue(settings({ firstmateHome: "/tmp/fm", firstmateHomeExists: true }));
    expect(screen.queryByRole("button", { name: "저장" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("firstmate 홈 경로"), {
      target: { value: "/tmp/fm" },
    });
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(mockSave.mock.calls[0]![0]).toEqual({ firstmateHome: "/tmp/fm", watchRoots: [], autoClose: true });
    expect(await screen.findByText(/저장됨/)).toBeInTheDocument();
  });

  it("존재하지 않는 경로는 서버 판정(INV-3)대로 경고를 보여준다", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(
      qk.settings,
      settings({ firstmateHome: "/없는/경로", firstmateHomeExists: false }),
    );
    render(
      <QueryClientProvider client={qc}>
        <SettingsView />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/없거나 폴더가 아닙니다/);
  });

  it("입력 칸을 비워 변경하면 unset(null) 이 간다 — 기본값으로 돌아가는 유일한 길", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(qk.settings, settings({ firstmateHome: "/tmp/fm", firstmateHomeExists: true }));
    render(
      <QueryClientProvider client={qc}>
        <SettingsView />
      </QueryClientProvider>,
    );
    mockSave.mockResolvedValue(settings({}));
    fireEvent.change(screen.getByLabelText("firstmate 홈 경로"), { target: { value: "" } });
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(mockSave.mock.calls[0]![0]).toEqual(expect.objectContaining({ firstmateHome: null }));
  });

  it("firstmate 홈 찾아보기로 고르면 그 값이 입력 칸에 앉는다", async () => {
    mockPickFolder.mockResolvedValue("/골라온/경로");
    renderView();
    fireEvent.click(screen.getAllByRole("button", { name: /찾아보기/ })[0]!);
    await waitFor(() =>
      expect(screen.getByLabelText("firstmate 홈 경로")).toHaveValue("/골라온/경로"),
    );
  });

  it("firstmate 홈 미설정 시 placeholder 에 서버가 준 추천 경로가 보인다", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(
      qk.settings,
      settings({ firstmateHomeSuggestion: "/Users/x/Documents/ai2/firstmate2" }),
    );
    render(
      <QueryClientProvider client={qc}>
        <SettingsView />
      </QueryClientProvider>,
    );
    expect(screen.getByPlaceholderText("/Users/x/Documents/ai2/firstmate2")).toBeInTheDocument();
  });

  it("감시 카테고리 — 감시 폴더 추가·삭제가 목록에 반영되고 자동 저장된다", async () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /감시/ }));
    const input = screen.getByLabelText("감시 폴더 추가 경로");
    fireEvent.change(input, { target: { value: "/new/root" } });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));
    expect(screen.getByText("/new/root")).toBeInTheDocument();

    mockSave.mockResolvedValue(settings({ effectiveWatchRoots: ["/new/root"] }));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(mockSave.mock.calls[0]![0]).toEqual({ firstmateHome: null, watchRoots: ["/new/root"], autoClose: true });

    // 삭제
    fireEvent.click(screen.getByRole("button", { name: "감시 목록에서 제거" }));
    expect(screen.queryByText("/new/root")).not.toBeInTheDocument();
  });

  it("숨김 카테고리 — 차단한 작업 가지 목록 + 해제 버튼", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(
      qk.settings,
      settings({ blockedCopies: ["gootte/3", "jinwooauto/2"] }),
    );
    render(
      <QueryClientProvider client={qc}>
        <SettingsView />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /숨김/ }));
    expect(screen.getByText("gootte/3")).toBeInTheDocument();
    expect(screen.getByText("jinwooauto/2")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "차단 해제" })).toHaveLength(2);
  });

  it("테마 카테고리 — 실제 테마 토글이 보이고 클릭해 전환된다", () => {
    renderViewWithTheme();
    fireEvent.click(screen.getByRole("button", { name: /테마/ }));
    const toggles = screen.getAllByRole("button", { name: /테마/ });
    const themeBtn = toggles.find((b) => b.getAttribute("title")?.startsWith("테마:"));
    expect(themeBtn).toBeDefined();
    // system → dark 전환
    fireEvent.click(themeBtn!);
    expect(screen.getByText("다크")).toBeInTheDocument();
  });

  it("🔴 캐시 다시 읽기 — 버튼이 refreshBackend 를 부르고 성공 표시를 낸다", async () => {
    mockRefresh.mockResolvedValue(undefined);
    renderView();
    // 일반 카테고리 기본 — "다시 읽기" 버튼
    const btn = screen.getByRole("button", { name: /다시 읽기/ });
    fireEvent.click(btn);
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    expect(await screen.findByText(/다시 읽었습니다/)).toBeInTheDocument();
  });
});