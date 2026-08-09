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

describe("FeatureTree — 폴더에 실제로 있는 것만 뜬다(티켓 01 §설계 3, INV-4)", () => {
  it("spec.md + issues + adr/ 이 있으면 셋 다 트리에 뜬다", () => {
    const feature: Feature = {
      ...BASE,
      docs: [
        { kind: "dir", name: "adr", path: "adr", children: [{ kind: "file", name: "0001-x.md", path: "adr/0001-x.md" }] },
        { kind: "file", name: "spec.md", path: "spec.md" },
      ],
    };
    renderCard(feature);
    open();
    expect(screen.getByText("issues")).toBeInTheDocument();
    expect(screen.getByText("세션 발급")).toBeInTheDocument(); // issues 가 이미 펼쳐진 채로 시작
    expect(screen.getByText("adr")).toBeInTheDocument();
    expect(screen.getByText("spec.md")).toBeInTheDocument();
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

  it("티켓이 없는 기능도 issues 칸엔 '티켓이 없습니다' 가 뜬다 — 파일 이름만 남기지 않는다", () => {
    const feature: Feature = { ...BASE, tickets: [], docs: [] };
    renderCard(feature);
    open();
    expect(screen.getByText("티켓이 없습니다.")).toBeInTheDocument();
  });
});
