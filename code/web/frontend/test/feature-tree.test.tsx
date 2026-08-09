import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Feature } from "@gootte/contract";
import { FeatureCard } from "../src/components/features/FeatureCard";

const BASE: Omit<Feature, "docs"> = {
  slug: "auth-login",
  title: "auth-login — 로그인",
  status: "pending",
  sourceStatus: "ready-for-agent",
  statusKnown: true,
  tickets: [
    {
      num: "01",
      slug: "01-session",
      title: "세션 발급",
      status: "pending",
      sourceStatus: "ready-for-agent",
      statusKnown: true,
      blockedBy: [],
      waitingOn: [],
      startable: true,
      workedBy: [],
    },
  ],
};

function renderCard(feature: Feature, onOpenDoc = vi.fn()) {
  render(<FeatureCard feature={feature} onOpenDoc={onOpenDoc} />);
  return { onOpenDoc };
}

function open() {
  fireEvent.click(screen.getByRole("heading", { name: "auth-login — 로그인" }).closest("button")!);
}

describe("FeatureTree — check 는 파싱된 현황판, 나머지는 폴더에 실제로 있는 것만(INV-4)", () => {
  it("check 는 진입점으로 고정, 기본 펼침 — 파싱된 제목·상태로 뜬다(파일명이 아니다)", () => {
    const feature: Feature = { ...BASE, docs: [] };
    renderCard(feature);
    open();
    expect(screen.getByText("check")).toBeInTheDocument();
    expect(screen.getByText("세션 발급")).toBeInTheDocument(); // 파싱된 제목 — 파일명("01-session.md")이 아니다
  });

  it("issues/ 는 실제 파일 목록으로 뜬다 — 파일을 누르면 원문을 읽을 수 있다(캡틴 피드백)", () => {
    const feature: Feature = {
      ...BASE,
      docs: [
        {
          kind: "dir",
          name: "issues",
          path: "issues",
          children: [{ kind: "file", name: "01-session.md", path: "issues/01-session.md" }],
        },
      ],
    };
    const { onOpenDoc } = renderCard(feature);
    open();
    expect(screen.getByText("issues")).toBeInTheDocument(); // check 와 별개로 실제 폴더도 뜬다
    fireEvent.click(screen.getByText("issues")); // 기본 접힘 — 눌러 편다
    fireEvent.click(screen.getByText("01-session.md"));
    expect(onOpenDoc).toHaveBeenCalledWith("auth-login", "issues/01-session.md", expect.any(HTMLElement));
  });

  it("spec.md + issues/ + adr/ 이 있으면 셋 다 트리에 뜬다", () => {
    const feature: Feature = {
      ...BASE,
      docs: [
        { kind: "dir", name: "adr", path: "adr", children: [{ kind: "file", name: "0001-x.md", path: "adr/0001-x.md" }] },
        { kind: "dir", name: "issues", path: "issues", children: [{ kind: "file", name: "01-session.md", path: "issues/01-session.md" }] },
        { kind: "file", name: "spec.md", path: "spec.md" },
      ],
    };
    renderCard(feature);
    open();
    expect(screen.getByText("adr")).toBeInTheDocument();
    expect(screen.getByText("issues")).toBeInTheDocument();
    expect(screen.getByText("spec.md")).toBeInTheDocument();
  });

  it("순서는 adr → issues → check → 나머지 낱장 문서로 고정된다(캡틴 지시)", () => {
    const feature: Feature = {
      ...BASE,
      docs: [
        // 뒤섞어 넣어도 렌더 순서는 고정이어야 한다.
        { kind: "file", name: "architecture.md", path: "architecture.md" },
        { kind: "file", name: "spec.md", path: "spec.md" },
        { kind: "dir", name: "issues", path: "issues", children: [] },
        { kind: "dir", name: "adr", path: "adr", children: [] },
      ],
    };
    renderCard(feature);
    open();
    const labels = ["adr", "issues", "check", "architecture.md", "spec.md"];
    for (let i = 0; i < labels.length - 1; i++) {
      const a = screen.getByText(labels[i]!);
      const b = screen.getByText(labels[i + 1]!);
      // a 가 b 보다 문서상 앞선다(DOCUMENT_POSITION_FOLLOWING = b 가 a 뒤에 옴).
      expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("🔴 adr/ 가 없으면 트리에 adr 칸이 없다 — 빈 칸으로도 안 뜬다", () => {
    const feature: Feature = { ...BASE, docs: [{ kind: "file", name: "spec.md", path: "spec.md" }] };
    renderCard(feature);
    open();
    expect(screen.queryByText("adr")).toBeNull();
    expect(screen.getByText("spec.md")).toBeInTheDocument();
  });

  it("architecture.md 같은 낱장 문서도 그대로 뜬다 — 버려지지 않는다", () => {
    const feature: Feature = {
      ...BASE,
      docs: [
        { kind: "file", name: "architecture.md", path: "architecture.md" },
        { kind: "file", name: "spec.md", path: "spec.md" },
      ],
    };
    renderCard(feature);
    open();
    expect(screen.getByText("architecture.md")).toBeInTheDocument();
  });

  it("adr/ 하위 문서를 누르면 폴더 기준 상대 경로로 onOpenDoc 이 불린다", () => {
    const feature: Feature = {
      ...BASE,
      docs: [
        {
          kind: "dir",
          name: "adr",
          path: "adr",
          children: [{ kind: "file", name: "0001-x.md", path: "adr/0001-x.md" }],
        },
      ],
    };
    const { onOpenDoc } = renderCard(feature);
    open();
    fireEvent.click(screen.getByText("adr")); // 하위 폴더는 기본 접힘 — 눌러 편다
    fireEvent.click(screen.getByText("0001-x.md"));
    expect(onOpenDoc).toHaveBeenCalledWith("auth-login", "adr/0001-x.md", expect.any(HTMLElement));
  });

  it("spec.md 를 누르면 onOpenDoc 이 불린다", () => {
    const feature: Feature = { ...BASE, docs: [{ kind: "file", name: "spec.md", path: "spec.md" }] };
    const { onOpenDoc } = renderCard(feature);
    open();
    fireEvent.click(screen.getByText("spec.md"));
    expect(onOpenDoc).toHaveBeenCalledWith("auth-login", "spec.md", expect.any(HTMLElement));
  });

  it("티켓이 없는 기능도 check 칸엔 '티켓이 없습니다' 가 뜬다", () => {
    const feature: Feature = { ...BASE, tickets: [], docs: [] };
    renderCard(feature);
    open();
    expect(screen.getByText("티켓이 없습니다.")).toBeInTheDocument();
  });
});
