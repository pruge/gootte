import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Memo, MemosResponse } from "@gootte/contract";
import { MemoView } from "../src/components/memo/MemoView";
import { qk } from "../src/lib/query";
import * as api from "../src/lib/api";

vi.mock("../src/lib/api", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/lib/api")>();
  return {
    ...mod,
    createMemo: vi.fn(),
    updateMemo: vi.fn(),
    deleteMemo: vi.fn(),
  };
});

const m = (id: string, content: string, at: string, done = false): Memo => ({
  id,
  content,
  done,
  createdAt: at,
  updatedAt: at,
});

function renderMemo(memos: Memo[]) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  const data: MemosResponse = { project: "alpha", memos };
  qc.setQueryData(qk.memos("alpha"), data);
  return {
    qc,
    ...render(
      <QueryClientProvider client={qc}>
        <MemoView project="alpha" />
      </QueryClientProvider>,
    ),
  };
}

describe("MemoView — memo-pad 탭", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("메모를 메모지로 보여준다 — 내용·작성 시각(날짜 시각)이 보인다", () => {
    renderMemo([m("1", "첫 번째 생각", "2026-09-01T10:30:00.000Z")]);
    expect(screen.getByText("첫 번째 생각")).toBeInTheDocument();
    expect(screen.getByText("2026-09-01 10:30:00")).toBeInTheDocument();
  });

  it("왼쪽에 날짜 목록이 선다 — 날짜마다 개수가 찍힌다", () => {
    renderMemo([
      m("1", "a", "2026-09-01T10:00:00.000Z"),
      m("2", "b", "2026-09-01T11:00:00.000Z"),
      m("3", "c", "2026-08-30T09:00:00.000Z"),
    ]);
    const left = screen.getByText("MEMOS").closest("aside") as HTMLElement;
    expect(within(left).getByText("2026-09-01")).toBeInTheDocument();
    expect(within(left).getByText("2026-08-30")).toBeInTheDocument();
    // 9월 1일에 메모 2개 — 개수 표시
    const dayBtn = within(left).getByRole("button", { name: /2026-09-01/ });
    expect(within(dayBtn).getByText("2")).toBeInTheDocument();
  });

  it("기본은 전체 — 모든 메모가 보인다", () => {
    renderMemo([m("1", "a", "2026-09-01T10:00:00.000Z"), m("2", "b", "2026-08-30T09:00:00.000Z")]);
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("b")).toBeInTheDocument();
  });

  it("날짜를 누르면 그 날짜 메모만 보인다", () => {
    renderMemo([m("1", "a", "2026-09-01T10:00:00.000Z"), m("2", "b", "2026-08-30T09:00:00.000Z")]);
    const left = screen.getByText("MEMOS").closest("aside") as HTMLElement;
    fireEvent.click(within(left).getByRole("button", { name: /2026-09-01/ }));
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.queryByText("b")).toBeNull();
  });

  it("메모가 없으면 빈 안내가 보인다", () => {
    renderMemo([]);
    expect(screen.getByText("메모가 없습니다.")).toBeInTheDocument();
  });

  it("새 메모 저장 — 내용을 채우고 저장 버튼을 누르면 createMemo 가 불린다", async () => {
    vi.mocked(api.createMemo).mockResolvedValue(m("9", "새 메모", "2026-09-02T00:00:00.000Z"));
    renderMemo([]);
    fireEvent.change(screen.getByPlaceholderText("떠오르는 생각을 적어 보세요…"), {
      target: { value: "새 메모" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(api.createMemo).toHaveBeenCalledWith("alpha", "새 메모"));
  });

  it("빈 내용은 저장하지 않는다 — 저장 버튼이 비활성화", () => {
    renderMemo([]);
    const saveBtn = screen.getByRole("button", { name: "저장" });
    expect(saveBtn).toBeDisabled();
  });

  it("메모 삭제 — 휴지통 버튼을 누르면 deleteMemo 가 id 로 불린다", async () => {
    vi.mocked(api.deleteMemo).mockResolvedValue({ ok: true });
    renderMemo([m("1", "지울 것", "2026-09-01T10:00:00.000Z")]);
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(api.deleteMemo).toHaveBeenCalledWith("alpha", "1"));
  });

  it("메모 수정 — 내용을 바꾸고 저장 버튼을 누르면 updateMemo 가 id·내용으로 불린다", async () => {
    vi.mocked(api.updateMemo).mockResolvedValue(m("1", "고친 것", "2026-09-01T10:00:00.000Z"));
    renderMemo([m("1", "원본", "2026-09-01T10:00:00.000Z")]);
    const note = screen.getByPlaceholderText("내용 없음").closest("div") as HTMLElement;
    fireEvent.change(within(note).getByPlaceholderText("내용 없음"), {
      target: { value: "고친 것" },
    });
    fireEvent.click(within(note).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(api.updateMemo).toHaveBeenCalledWith("alpha", "1", "고친 것", undefined));
  });

  it("체크 아이콘 클릭 → updateMemo 가 done: true 로 불리고, 취소선이 걸린다", async () => {
    vi.mocked(api.updateMemo).mockResolvedValue(m("1", "원본", "2026-09-01T10:00:00.000Z", true));
    renderMemo([m("1", "원본", "2026-09-01T10:00:00.000Z")]);
    fireEvent.click(screen.getByRole("button", { name: "완료로 표시" }));
    await waitFor(() => expect(api.updateMemo).toHaveBeenCalledWith("alpha", "1", "원본", true));
  });

  it("검색어로 메모를 걸러낸다 — 내용에 든 메모만 남는다", () => {
    renderMemo([
      m("1", "로그인 토큰을 만든다", "2026-09-01T10:00:00.000Z"),
      m("2", "계획 판 자리를 고민", "2026-08-30T09:00:00.000Z"),
    ]);
    fireEvent.change(screen.getByLabelText("메모 검색"), { target: { value: "로그인" } });
    expect(screen.getByText("로그인 토큰을 만든다")).toBeInTheDocument();
    expect(screen.queryByText("계획 판 자리를 고민")).toBeNull();
  });

  it("검색어를 지우면 전체 메모가 다시 보인다", () => {
    renderMemo([
      m("1", "로그인 토큰을 만든다", "2026-09-01T10:00:00.000Z"),
      m("2", "계획 판 자리를 고민", "2026-08-30T09:00:00.000Z"),
    ]);
    const input = screen.getByLabelText("메모 검색");
    fireEvent.change(input, { target: { value: "로그인" } });
    expect(screen.queryByText("계획 판 자리를 고민")).toBeNull();
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByText("로그인 토큰을 만든다")).toBeInTheDocument();
    expect(screen.getByText("계획 판 자리를 고민")).toBeInTheDocument();
  });

  it("검색 결과가 없으면 빈 안내가 보인다 — '메모가 없습니다'", () => {
    renderMemo([m("1", "로그인 토큰을 만든다", "2026-09-01T10:00:00.000Z")]);
    fireEvent.change(screen.getByLabelText("메모 검색"), { target: { value: "없는단어" } });
    expect(screen.getByText("메모가 없습니다.")).toBeInTheDocument();
  });

  it("날짜 선택 + 검색이 겹치면 교집합만 보인다", () => {
    renderMemo([
      m("1", "로그인 토큰", "2026-09-01T10:00:00.000Z"),
      m("2", "로그인 리프레시", "2026-08-30T09:00:00.000Z"),
    ]);
    const left = screen.getByText("MEMOS").closest("aside") as HTMLElement;
    fireEvent.click(within(left).getByRole("button", { name: /2026-09-01/ }));
    fireEvent.change(screen.getByLabelText("메모 검색"), { target: { value: "로그인" } });
    expect(screen.getByText("로그인 토큰")).toBeInTheDocument();
    expect(screen.queryByText("로그인 리프레시")).toBeNull();
  });
});
