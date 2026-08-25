import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";
import { SettingsResponse, type SettingsResponse as SettingsResponseType } from "@gootte/contract";
import { SettingsDialog } from "../src/components/settings/SettingsDialog";
import { qk } from "../src/lib/query";

vi.mock("../src/lib/api", () => ({
  fetchSettings: vi.fn(),
  saveSettings: vi.fn(),
}));

vi.mock("../src/lib/tauri", () => ({
  isTauri: vi.fn(() => true),
  pickFolder: vi.fn(),
}));

import { fetchSettings, saveSettings } from "../src/lib/api";
import { pickFolder } from "../src/lib/tauri";

const mockFetch = vi.mocked(fetchSettings);
const mockSave = vi.mocked(saveSettings);
const mockPickFolder = vi.mocked(pickFolder);

function settings(partial: Partial<SettingsResponseType>): SettingsResponseType {
  return SettingsResponse.parse({
    watchRoot: null,
    firstmateHome: null,
    watchRootExists: false,
    firstmateHomeExists: false,
    firstmateHomeSuggestion: null,
    ...partial,
  });
}

function renderDialog(open = true): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(qk.settings, settings({}));
  render(
    <QueryClientProvider client={qc}>
      <SettingsDialog open={open} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("SettingsDialog", () => {
  it("저장은 두 경로를 PUT 하고 성공 표시를 낸다", async () => {
    renderDialog();
    mockSave.mockResolvedValue(settings({ watchRoot: "/tmp/watch", watchRootExists: true }));
    fireEvent.change(screen.getByLabelText("감시 루트 폴더"), {
      target: { value: "/tmp/watch" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    // react-query 가 mutationFn 에 두 번째 인수(context)를 주므로 첫 인수만 본다.
    expect(mockSave.mock.calls[0]![0]).toEqual({ watchRoot: "/tmp/watch", firstmateHome: null });
    expect(await screen.findByText(/저장했습니다/)).toBeInTheDocument();
  });

  it("존재하지 않는 경로는 서버 판정(INV-3)대로 경고를 보여준다 — 저장 자체는 막지 않는다", async () => {
    // 서버가 "없는 경로가 저장되어 있다" 고 답한 상태에서 열리면 경고가 보인다.
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(
      qk.settings,
      settings({ watchRoot: "/없는/경로", watchRootExists: false }),
    );
    render(
      <QueryClientProvider client={qc}>
        <SettingsDialog open onClose={() => {}} />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/없거나 폴더가 아닙니다/);
    // 저장 버튼은 여전히 누릴 수 있다(값이 그대로면 dirty 가 아니다 → 저장 불필요).
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("입력 칸을 비워 저장하면 unset(null) 이 간다 — 기본값으로 돌아가는 유일한 길", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(qk.settings, settings({ watchRoot: "/tmp/watch", watchRootExists: true }));
    render(
      <QueryClientProvider client={qc}>
        <SettingsDialog open onClose={() => {}} />
      </QueryClientProvider>,
    );
    mockSave.mockResolvedValue(settings({}));
    fireEvent.change(screen.getByLabelText("감시 루트 폴더"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(mockSave.mock.calls[0]![0]).toEqual(expect.objectContaining({ watchRoot: null }));
  });

  it("firstmate 홈 안내문은 실제 동작을 말한다 — 비우면 조인·감시가 꺼진다", () => {
    renderDialog();
    expect(screen.getByText(/조인과 백로그 감시가 꺼집니다/)).toBeInTheDocument();
  });

  it("firstmate 홈 필드에도 찾아보기 버튼이 있다(Tauri 셸에서) — watchRoot 와 동일 UX", () => {
    renderDialog();
    const buttons = screen.getAllByRole("button", { name: /찾아보기/ });
    expect(buttons).toHaveLength(2);
  });

  it("firstmate 홈 찾아보기로 고르면 그 값이 입력 칸에 앉는다", async () => {
    mockPickFolder.mockResolvedValue("/골라온/경로");
    renderDialog();
    const buttons = screen.getAllByRole("button", { name: /찾아보기/ });
    fireEvent.click(buttons[1]!); // 0=감시 루트, 1=firstmate 홈
    await waitFor(() =>
      expect(screen.getByLabelText("firstmate 홈 경로")).toHaveValue("/골라온/경로"),
    );
  });

  it("찾아보기 다이얼로그가 실패하면 조용히 흘리지 않고 경고를 보여준다(review F2)", async () => {
    mockPickFolder.mockRejectedValue(new Error("플러그인 오류"));
    renderDialog();
    const buttons = screen.getAllByRole("button", { name: /찾아보기/ });
    fireEvent.click(buttons[1]!); // firstmate 홈 쪽 버튼
    expect(await screen.findByText(/폴더 선택 실패: 플러그인 오류/)).toBeInTheDocument();
  });

  it("감시 루트 찾아보기도 같은 길을 탄다", async () => {
    mockPickFolder.mockResolvedValue("/감시/루트");
    renderDialog();
    fireEvent.click(screen.getAllByRole("button", { name: /찾아보기/ })[0]!);
    await waitFor(() =>
      expect(screen.getByLabelText("감시 루트 폴더")).toHaveValue("/감시/루트"),
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
        <SettingsDialog open onClose={() => {}} />
      </QueryClientProvider>,
    );
    expect(screen.getByPlaceholderText("/Users/x/Documents/ai2/firstmate2")).toBeInTheDocument();
  });

  it("firstmate 홈에 값이 이미 있으면 입력 칸은 추천 경로가 아니라 저장된 값을 보여준다", () => {
    // placeholder 는 값이 있으면 브라우저가 안 그리는 것이 표준 동작이라(HTML 자체 규약),
    // 여기선 화면이 추천을 값 위에 덮어쓰지 않는지만 확인한다.
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(
      qk.settings,
      settings({
        firstmateHome: "/이미/설정됨",
        firstmateHomeExists: true,
        firstmateHomeSuggestion: "/Users/x/Documents/ai2/firstmate2",
      }),
    );
    render(
      <QueryClientProvider client={qc}>
        <SettingsDialog open onClose={() => {}} />
      </QueryClientProvider>,
    );
    expect(screen.getByLabelText("firstmate 홈 경로")).toHaveValue("/이미/설정됨");
  });
});
