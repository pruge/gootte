import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import type { Feature, FeaturesResponse } from "@gootte/contract";
import { FeaturesView } from "../src/components/features/FeaturesView";
import { qk } from "../src/lib/query";

/**
 * 가상 스크롤(a-long-list-stays-usable/02) 검사. jsdom 은 레이아웃을 안 하므로
 * `vitest.setup.ts` 가 `[data-virtual-viewport]`(뷰포트 600px) · `[data-virtual-row]`(줄 80px)
 * 에만 고정 높이를 흉내낸다 — 실제 픽셀(③ 스크롤이 튀지 않는가)은 캡틴이 브라우저로 본다.
 * 여기서 붙드는 것은 **창이 실제로 마운트·언마운트되는가**(①②) 와 **개수로 길이 안 갈리는가**
 * (INV-V3) 다.
 */

const NO_WORK: FeaturesResponse["inProgress"] = {
  root: "/tmp/th",
  rootExists: true,
  copies: 0,
  working: 0,
  tickets: 0,
  unknown: [],
  unreadable: [],
  unclaimed: [],
};

function manyFeatures(n: number): Feature[] {
  return Array.from({ length: n }, (_, i) => {
    const slug = `feature-${String(i).padStart(3, "0")}`;
    return {
      slug,
      title: `${slug} — 기능 ${i}`,
      status: "pending" as const,
      sourceStatus: "ready-for-agent",
      statusKnown: true,
      docs: [],
      tickets: [
        {
          num: "01",
          slug: "01-a",
          path: "issues/01-a.md",
          title: `기능 ${i} 티켓`,
          status: "pending" as const,
          sourceStatus: "ready-for-agent",
          statusKnown: true,
          blockedBy: [],
          unreadableBlockedBy: [],
          waitingOn: [],
          startable: true,
          workedBy: [],
          needsCaptainEye: false,
        },
      ],
    };
  });
}

function dataWith(features: Feature[]): FeaturesResponse {
  return { project: "alpha", inProgress: NO_WORK, features };
}

function Harness({ data, initialView = null }: { data: FeaturesResponse; initialView?: string | null }) {
  const [view, setView] = useState<string | null>(initialView);
  return <FeaturesView project={data.project} view={view} onView={setView} onGoToPlanFeature={vi.fn()} />;
}

function renderView(data: FeaturesResponse, initialView: string | null = null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(qk.features(data.project), data);
  return render(
    <QueryClientProvider client={qc}>
      <Harness data={data} initialView={initialView} />
    </QueryClientProvider>,
  );
}

function scrollContainer(): HTMLElement {
  return document.querySelector<HTMLElement>("[data-virtual-viewport]")!;
}

function scrollTo(top: number): void {
  fireEvent.scroll(scrollContainer(), { target: { scrollTop: top } });
}

function openCard(title: string): void {
  fireEvent.click(screen.getByRole("heading", { name: title }).closest("button")!);
}

describe("FeaturesView — 개수로 길이 갈리지 않는다(INV-V3, a-long-list-stays-usable/02)", () => {
  it("짧은 목록도 긴 목록도 같은 가상 스크롤 구조로 그려진다", () => {
    renderView(dataWith(manyFeatures(3)));
    const container = scrollContainer();
    expect(container).toBeInTheDocument();
    expect(container.querySelectorAll("[data-virtual-row]").length).toBeGreaterThan(0);
  });

  it("긴 목록도 같은 구조 — 화면 밖 카드는 그리지 않는다", () => {
    renderView(dataWith(manyFeatures(60)));
    const container = scrollContainer();
    const rows = container.querySelectorAll("[data-virtual-row]");
    expect(rows.length).toBeGreaterThan(0);
    // 60장을 다 그렸다면 가상 스크롤이 전혀 창을 안 만든 것이다 — 실패해야 맞다.
    expect(rows.length).toBeLessThan(60);
    // 맨 마지막 카드는 화면 밖 — 스크롤 없이는 안 그려진다.
    expect(screen.queryByRole("heading", { name: "기능 59" })).toBeNull();
    expect(screen.getByRole("heading", { name: "기능 0" })).toBeInTheDocument();
  });
});

describe("FeaturesView — 펼쳐 둔 카드는 스크롤로 밀려났다 돌아와도 펼쳐져 있다(①, a-long-list-stays-usable/02)", () => {
  it("펼친 카드가 스크롤로 화면 밖에 나갔다 돌아와도 여전히 펼쳐져 있다", () => {
    renderView(dataWith(manyFeatures(60)));
    openCard("기능 0");
    expect(screen.getByRole("heading", { name: "기능 0" }).closest("button")).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    scrollTo(4000); // 훨씬 아래로 — 0번 카드가 창(뷰포트+overscan) 밖으로 밀려난다.
    expect(screen.queryByRole("heading", { name: "기능 0" })).toBeNull();

    scrollTo(0); // 되돌아온다.
    expect(screen.getByRole("heading", { name: "기능 0" }).closest("button")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });
});

describe("FeaturesView — 문서를 닫으면 눌렀던 자리로 돌아가 포커스가 얹힌다(②, a-long-list-stays-usable/02)", () => {
  it("화면 밖으로 밀려났던 자리에서 연 문서를 닫으면 그 자리로 스크롤하고 포커스를 돌려준다", () => {
    renderView(dataWith(manyFeatures(60)));
    openCard("기능 0");
    const trigger = screen.getByText("기능 0 티켓").closest("button")!;
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    scrollTo(4000); // 드로어를 연 채로 그 카드가 화면 밖으로 밀려난다 — 트리거는 언마운트된다.
    expect(screen.queryByText("기능 0 티켓")).toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    // 스크롤이 그 자리로 되돌아왔다 — 트리거(새 DOM 노드)가 다시 보이고 포커스가 얹힌다.
    const restored = screen.getByText("기능 0 티켓").closest("button")!;
    expect(document.activeElement).toBe(restored);
  });

  it("화면 안에 그대로 있던 자리는 옛 요소 그대로 포커스가 돌아온다(회귀 없음)", () => {
    renderView(dataWith(manyFeatures(60)));
    openCard("기능 0");
    const trigger = screen.getByText("기능 0 티켓").closest("button")!;
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("FeaturesView — 검색으로 걸러진 목록도 같은 길로 그려진다(a-long-list-stays-usable/02)", () => {
  it("검색이 걸러낸 목록도 가상 스크롤 구조 그대로다", () => {
    const features = manyFeatures(60);
    renderView(dataWith(features));
    const searchBox = screen.getByPlaceholderText("기능·티켓 검색");
    fireEvent.change(searchBox, { target: { value: "기능 5" } }); // "기능 5", "기능 5x" 류만 남는다
    const container = scrollContainer();
    expect(container.querySelectorAll("[data-virtual-row]").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "기능 5" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "기능 0" })).toBeNull();
  });
});
