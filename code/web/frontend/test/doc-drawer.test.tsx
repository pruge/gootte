import { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FeaturesResponse } from "@gootte/contract";
import { DocDrawer } from "../src/components/features/DocDrawer";
import { FeaturesView } from "../src/components/features/FeaturesView";
import { qk } from "../src/lib/query";
import * as api from "../src/lib/api";

function renderDrawer(opts: {
  featureSlug: string | null;
  path: string | null;
  onClose?: () => void;
  seed?: { path: string; content: string };
}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  if (opts.seed && opts.featureSlug && opts.path) {
    qc.setQueryData(qk.featureDoc("alpha", opts.featureSlug, opts.path), opts.seed);
  }
  const onClose = opts.onClose ?? vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <DocDrawer project="alpha" featureSlug={opts.featureSlug} path={opts.path} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose, qc };
}

describe("DocDrawer — 마크다운을 서식대로 렌더링한다(티켓 01 §설계 4)", () => {
  it("closed(path 없음) 이면 아무것도 렌더되지 않는다", () => {
    renderDrawer({ featureSlug: null, path: null });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("제목·목록·표가 서식대로 뜬다", () => {
    const content = [
      "# 제목",
      "",
      "- 하나",
      "- 둘",
      "",
      "| 열 | 값 |",
      "|---|---|",
      "| a | 1 |",
    ].join("\n");
    renderDrawer({ featureSlug: "auth-login", path: "spec.md", seed: { path: "spec.md", content } });

    expect(screen.getByRole("heading", { level: 1, name: "제목" })).toBeInTheDocument();
    expect(screen.getByText("하나")).toBeInTheDocument();
    expect(screen.getByText("둘")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "열" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "a" })).toBeInTheDocument();
  });

  it("🔴 다이어그램 코드블록은 되살리지 않는다 — 코드블록으로 남는다", () => {
    const content = ["```mermaid", "graph TD; A-->B;", "```"].join("\n");
    renderDrawer({ featureSlug: "auth-login", path: "spec.md", seed: { path: "spec.md", content } });

    // svg/diagram 컨테이너가 아니라 <pre><code> 그대로.
    expect(screen.queryByRole("img")).toBeNull();
    const code = document.querySelector("pre code")!;
    expect(code).toBeTruthy();
    expect(code.textContent).toContain("graph TD; A-->B;");
    expect(code.className).toContain("language-mermaid");
  });

  it("ESC 를 누르면 onClose 가 불린다", () => {
    const { onClose } = renderDrawer({
      featureSlug: "auth-login",
      path: "spec.md",
      seed: { path: "spec.md", content: "# 제목\n" },
    });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("닫기 버튼과 배경을 누르면 onClose 가 불린다", () => {
    const { onClose } = renderDrawer({
      featureSlug: "auth-login",
      path: "spec.md",
      seed: { path: "spec.md", content: "# 제목\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("DocDrawer — 읽지 못한 문서는 조용히 빈 드로어가 되지 않는다", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("🔴 fetch 가 실패하면 무엇이 잘못됐는지 화면에 뜬다 — 빈 드로어가 아니다", async () => {
    vi.spyOn(api, "fetchFeatureDoc").mockRejectedValue(new Error("기능 폴더 밖의 경로는 읽을 수 없습니다"));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    render(
      <QueryClientProvider client={qc}>
        <DocDrawer project="alpha" featureSlug="auth-login" path="../../etc/passwd" onClose={vi.fn()} />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("기능 폴더 밖의 경로는 읽을 수 없습니다");
    });
  });
});

const FEATURES_DATA: FeaturesResponse = {
  project: "alpha",
  inProgress: { root: "/tmp/th", rootExists: true, copies: 0, working: 0, tickets: 0, unknown: [], unreadable: [] },
  features: [
    {
      slug: "auth-login",
      title: "auth-login — 로그인",
      status: "pending",
      sourceStatus: "ready-for-agent",
      statusKnown: true,
      tickets: [],
      docs: [{ kind: "file", name: "spec.md", path: "spec.md" }],
    },
  ],
};

function Harness({ initialView = null }: { initialView?: string | null }) {
  const [view, setView] = useState<string | null>(initialView);
  return <FeaturesView project="alpha" view={view} onView={setView} />;
}

function renderApp(initialView: string | null = null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(qk.features("alpha"), FEATURES_DATA);
  qc.setQueryData(qk.featureDoc("alpha", "auth-login", "spec.md"), { path: "spec.md", content: "# 사양\n" });
  render(
    <QueryClientProvider client={qc}>
      <Harness initialView={initialView} />
    </QueryClientProvider>,
  );
}

describe("DocDrawer — 열린 문서는 URL 에 실린다(F8, 티켓 01 §설계 4)", () => {
  it("URL 에 문서를 실은 채 새로고침하면 그 문서가 열린 채로 뜬다", () => {
    renderApp("auth-login/spec.md");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "사양" })).toBeInTheDocument();
  });

  it("닫으면 포커스가 눌렀던 자리로 돌아온다", () => {
    renderApp();
    fireEvent.click(screen.getByRole("heading", { name: "auth-login — 로그인" }).closest("button")!);
    const trigger = screen.getByText("spec.md");
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
