import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Feature } from "@gootte/contract";
import { FeatureCard } from "../src/components/features/FeatureCard";
import { TICKET_LIST_DEPTH, treeIndentStyle } from "../src/lib/tree-indent";

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

describe("check 목록이 issues 목록과 같은 자리에서 시작한다(feature-doc-browser/02)", () => {
  it("issues 를 편 파일 줄과 check 아래 티켓 줄의 왼쪽 값이 같다", () => {
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
    renderCard(feature);
    open();
    fireEvent.click(screen.getByText("issues")); // 기본 접힘 — 눌러 편다

    const fileButton = screen.getByText("01-session.md").closest("button")!;
    const ticketRow = screen.getByText("세션 발급").closest("li")!;
    const expected = treeIndentStyle(TICKET_LIST_DEPTH).paddingLeft;

    expect(fileButton.style.paddingLeft).toBe(expected);
    expect(ticketRow.style.paddingLeft).toBe(expected);
  });

  it("티켓이 없는 기능의 빈 문구도 같은 왼쪽 값에서 시작한다", () => {
    const feature: Feature = { ...BASE, tickets: [], docs: [] };
    renderCard(feature);
    open();
    const empty = screen.getByText("티켓이 없습니다.");
    expect(empty.style.paddingLeft).toBe(treeIndentStyle(TICKET_LIST_DEPTH).paddingLeft);
  });

  it("🔴 머리글(check·issues)은 서로 같은 깊이(0)로 남는다 — 손대지 않는다(F17)", () => {
    const feature: Feature = {
      ...BASE,
      docs: [{ kind: "dir", name: "issues", path: "issues", children: [] }],
    };
    renderCard(feature);
    open();
    const issuesHeader = screen.getByText("issues").closest("button")!;
    const checkHeader = screen.getByText("check").closest("button")!;
    const expected = treeIndentStyle(0).paddingLeft;

    expect(issuesHeader.style.paddingLeft).toBe(expected);
    expect(checkHeader.style.paddingLeft).toBe(""); // check 버튼은 트리 들여쓰기를 쓰지 않는다(px-4 그대로)
  });
});

describe("TicketRow — 단계 칸은 늘 자리를 지킨다(ticket-row-repair/03)", () => {
  it("🔴 완료된 티켓도 단계 칸이 그려진다 — 자리가 사라지지 않는다", () => {
    const feature: Feature = {
      ...BASE,
      docs: [],
      tickets: [{ ...BASE.tickets[0]!, status: "done", sourceStatus: "resolved", startable: true }],
    };
    renderCard(feature);
    open();
    const row = screen.getByText("세션 발급").closest("li")!;
    // 세 후보 라벨이 전부 DOM 에 있다(폭 계산용) — 그러나 셋 다 비어 보인다. 대체 문자는 없다.
    for (const label of ["착수 가능", "진행중", "대기"]) {
      expect(within(row).getByText(label)).toHaveClass("invisible");
    }
  });

  it("🔴 같은 상황(취소) — 그 칸이 비어 있다. 대체 문자도, 지어낸 값도 없다", () => {
    const feature: Feature = {
      ...BASE,
      docs: [],
      tickets: [{ ...BASE.tickets[0]!, status: "dropped", sourceStatus: "wontfix", startable: true }],
    };
    renderCard(feature);
    open();
    const row = screen.getByText("세션 발급").closest("li")!;
    for (const label of ["착수 가능", "진행중", "대기"]) {
      expect(within(row).getByText(label)).toHaveClass("invisible");
    }
  });

  it("선행이 다 풀렸고 임자가 없는 티켓 → 착수 가능", () => {
    const feature: Feature = { ...BASE, docs: [] };
    renderCard(feature);
    open();
    const row = screen.getByText("세션 발급").closest("li")!;
    expect(within(row).getByText("착수 가능")).not.toHaveClass("invisible");
  });

  it("살아 있는 사본이 붙든 티켓 → 진행중, 그리고 가지 이름이 계속 보인다", () => {
    const feature: Feature = {
      ...BASE,
      docs: [],
      tickets: [{ ...BASE.tickets[0]!, status: "in_progress", workedBy: ["fm/session-work"] }],
    };
    renderCard(feature);
    open();
    const row = screen.getByText("세션 발급").closest("li")!;
    expect(within(row).getByText("진행중")).not.toHaveClass("invisible");
    expect(within(row).getByText("fm/session-work")).toBeInTheDocument();
  });

  it("선행이 남은 티켓 → 대기, 그리고 기다리는 대상이 계속 보인다", () => {
    const feature: Feature = {
      ...BASE,
      docs: [],
      tickets: [
        { ...BASE.tickets[0]!, startable: false, blockedBy: ["02"], waitingOn: ["02"] },
      ],
    };
    renderCard(feature);
    open();
    const row = screen.getByText("세션 발급").closest("li")!;
    expect(within(row).getByText("대기")).not.toHaveClass("invisible");
    expect(within(row).getByText("→ 02")).toBeInTheDocument();
  });

  it("🔴 네 상태가 한 목록에 섞여 있어도 네 줄의 단계 칸이 모두 그려진다", () => {
    const feature: Feature = {
      ...BASE,
      docs: [],
      tickets: [
        { ...BASE.tickets[0]!, num: "01", slug: "01-a", title: "완료", status: "done" },
        {
          ...BASE.tickets[0]!,
          num: "02",
          slug: "02-b",
          title: "진행중인 것",
          status: "in_progress",
          workedBy: ["fm/x"],
        },
        {
          ...BASE.tickets[0]!,
          num: "03",
          slug: "03-c",
          title: "대기중인 것",
          startable: false,
          blockedBy: ["02"],
          waitingOn: ["02"],
        },
        { ...BASE.tickets[0]!, num: "04", slug: "04-d", title: "착수 가능한 것" },
      ],
    };
    renderCard(feature);
    open();
    for (const title of ["완료", "진행중인 것", "대기중인 것", "착수 가능한 것"]) {
      const row = screen.getByText(title).closest("li")!;
      // 세 후보 모두 DOM 에 있다 — 칸의 존재 자체는 상태와 무관하게 늘 그려진다.
      for (const label of ["착수 가능", "진행중", "대기"]) {
        expect(within(row).getByText(label)).toBeInTheDocument();
      }
    }
  });

  it("임자만 있고 붙든 사본이 없는 티켓은 단계 칸에 끌어들이지 않는다 — 셋 다 비어 보인다", () => {
    const feature: Feature = {
      ...BASE,
      docs: [],
      tickets: [
        { ...BASE.tickets[0]!, sourceStatus: "claimed", startable: false, waitingOn: [] },
      ],
    };
    renderCard(feature);
    open();
    const row = screen.getByText("세션 발급").closest("li")!;
    for (const label of ["착수 가능", "진행중", "대기"]) {
      expect(within(row).getByText(label)).toHaveClass("invisible");
    }
  });
});
