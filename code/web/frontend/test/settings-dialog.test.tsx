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

import { fetchSettings, saveSettings } from "../src/lib/api";

const mockFetch = vi.mocked(fetchSettings);
const mockSave = vi.mocked(saveSettings);

function settings(partial: Partial<SettingsResponseType>): SettingsResponseType {
  return SettingsResponse.parse({
    watchRoot: null,
    firstmateHome: null,
    watchRootExists: false,
    firstmateHomeExists: false,
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
});
