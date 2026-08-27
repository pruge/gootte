import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Feature, FeatureDocNode, FeatureTicket } from "@gootte/contract";
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
      path: "issues/01-session.md",
      title: "세션 발급",
      status: "pending",
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

/** 구관례 `issues/` 폴더 픽스처 — issues 칸은 이 폴더가 실재할 때만 그려진다(`{issues && ...}`, INV-4). */
function issuesDir(children: FeatureDocNode[] = []): FeatureDocNode {
  return { kind: "dir", name: "issues", path: "issues", children };
}

function renderCard(feature: Feature, onOpenDoc = vi.fn()) {
  const onGoToPlan = vi.fn();
  render(
    <FeatureCard
      feature={feature}
      onOpenDoc={onOpenDoc}
      onGoToPlan={onGoToPlan}
    />,
  );
  return { onOpenDoc, onGoToPlan };
}

// 🔴 표제 앞부분이 슬러그 배지와 겹쳐 h2 는 뗀 설명만 보여준다(`FeatureCard`, `featureDescription`).
function open() {
  fireEvent.click(
    screen.getByRole("heading", { name: "로그인" }).closest("button")!,
  );
}

describe("FeatureTree — issues 는 티켓 목록 하나뿐이다(feature-doc-browser/04, 같은 것을 두 벌 두지 않는다)", () => {
  it("🔴 카드 안 티켓 목록이 하나다 — issues 폴더 칸과 이전 check 칸이 나란히 있지 않다", () => {
    const feature: Feature = {
      ...BASE,
      docs: [
        {
          kind: "dir",
          name: "issues",
          path: "issues",
          children: [
            {
              kind: "file",
              name: "01-session.md",
              path: "issues/01-session.md",
            },
          ],
        },
      ],
    };
    renderCard(feature);
    open();
    // "issues" 라는 이름의 목록 진입점은 하나뿐이다.
    expect(screen.getAllByText("issues")).toHaveLength(1);
    expect(screen.queryByText("check")).toBeNull();
  });

  it("남는 목록의 이름은 issues 다 — 기본 펼침, 파싱된 제목으로 뜬다(파일명이 아니다)", () => {
    const feature: Feature = { ...BASE, docs: [issuesDir()] };
    renderCard(feature);
    open();
    expect(screen.getByText("issues")).toBeInTheDocument();
    expect(screen.getByText("세션 발급")).toBeInTheDocument(); // 파싱된 제목 — 파일명("01-session.md")이 아니다
  });

  it("🔴 줄을 누르면 그 티켓 경로로 드로어가 열린다 — issues/ + 이름을 화면이 조립하지 않는다, 서버가 준 path 그대로", () => {
    const feature: Feature = {
      ...BASE,
      tickets: [{ ...BASE.tickets[0]!, path: "issues/01-session.md" }],
      docs: [issuesDir()],
    };
    const { onOpenDoc } = renderCard(feature);
    open();
    fireEvent.click(screen.getByText("세션 발급"));
    expect(onOpenDoc).toHaveBeenCalledWith(
      "auth-login",
      "issues/01-session.md",
      expect.any(HTMLElement),
    );
  });

  it("키보드로도 열린다 — 문서 줄과 같은 방식(진짜 <button>이라 Enter 로 클릭된다)", () => {
    const feature: Feature = { ...BASE, docs: [issuesDir()] };
    const { onOpenDoc } = renderCard(feature);
    open();
    const row = screen.getByText("세션 발급").closest("button")!;
    row.focus();
    expect(document.activeElement).toBe(row);
    fireEvent.click(row); // jsdom 은 Enter → click 자동 디스패치를 안 하므로, 버튼임을 확인하고 click 으로 검증한다
    expect(onOpenDoc).toHaveBeenCalledWith(
      "auth-login",
      "issues/01-session.md",
      expect.any(HTMLElement),
    );
  });

  it("🔴 티켓 아닌 파일도 목록에 뜬다 — issues/ 안의 .md 아닌 파일이 목록 끝에 파일 이름만 한 줄로 뜬다", () => {
    const feature: Feature = {
      ...BASE,
      docs: [
        {
          kind: "dir",
          name: "issues",
          path: "issues",
          children: [
            {
              kind: "file",
              name: "01-session.md",
              path: "issues/01-session.md",
            },
            { kind: "file", name: "notes.txt", path: "issues/notes.txt" },
          ],
        },
      ],
    };
    const { onOpenDoc } = renderCard(feature);
    open();
    expect(screen.getByText("notes.txt")).toBeInTheDocument();
    fireEvent.click(screen.getByText("notes.txt"));
    expect(onOpenDoc).toHaveBeenCalledWith(
      "auth-login",
      "issues/notes.txt",
      expect.any(HTMLElement),
    );
  });

  it("adr 과 spec.md 는 그대로 있다 — issues 옆자리를 안 건드렸다", () => {
    const feature: Feature = {
      ...BASE,
      docs: [
        {
          kind: "dir",
          name: "adr",
          path: "adr",
          children: [
            { kind: "file", name: "0001-x.md", path: "adr/0001-x.md" },
          ],
        },
        {
          kind: "dir",
          name: "issues",
          path: "issues",
          children: [
            {
              kind: "file",
              name: "01-session.md",
              path: "issues/01-session.md",
            },
          ],
        },
        { kind: "file", name: "spec.md", path: "spec.md" },
      ],
    };
    renderCard(feature);
    open();
    expect(screen.getByText("adr")).toBeInTheDocument();
    expect(screen.getByText("issues")).toBeInTheDocument();
    expect(screen.getByText("spec.md")).toBeInTheDocument();
  });

  it("순서는 adr → issues → 나머지 낱장 문서로 고정된다(캡틴 지시)", () => {
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
    const labels = ["adr", "issues", "architecture.md", "spec.md"];
    for (let i = 0; i < labels.length - 1; i++) {
      const a = screen.getByText(labels[i]!);
      const b = screen.getByText(labels[i + 1]!);
      // a 가 b 보다 문서상 앞선다(DOCUMENT_POSITION_FOLLOWING = b 가 a 뒤에 옴).
      expect(
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("🔴 adr/ 가 없으면 트리에 adr 칸이 없다 — 빈 칸으로도 안 뜬다", () => {
    const feature: Feature = {
      ...BASE,
      docs: [{ kind: "file", name: "spec.md", path: "spec.md" }],
    };
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
          children: [
            { kind: "file", name: "0001-x.md", path: "adr/0001-x.md" },
          ],
        },
      ],
    };
    const { onOpenDoc } = renderCard(feature);
    open();
    fireEvent.click(screen.getByText("adr")); // 하위 폴더는 기본 접힘 — 눌러 편다
    fireEvent.click(screen.getByText("0001-x.md"));
    expect(onOpenDoc).toHaveBeenCalledWith(
      "auth-login",
      "adr/0001-x.md",
      expect.any(HTMLElement),
    );
  });

  it("spec.md 를 누르면 onOpenDoc 이 불린다", () => {
    const feature: Feature = {
      ...BASE,
      docs: [{ kind: "file", name: "spec.md", path: "spec.md" }],
    };
    const { onOpenDoc } = renderCard(feature);
    open();
    fireEvent.click(screen.getByText("spec.md"));
    expect(onOpenDoc).toHaveBeenCalledWith(
      "auth-login",
      "spec.md",
      expect.any(HTMLElement),
    );
  });

  it("issues/ 폴더가 있는데 파싱된 티켓이 없으면 issues 칸엔 '티켓이 없습니다' 가 뜬다", () => {
    const feature: Feature = { ...BASE, tickets: [], docs: [issuesDir([])] };
    renderCard(feature);
    open();
    expect(screen.getByText("티켓이 없습니다.")).toBeInTheDocument();
  });
});

describe("issues 목록의 티켓 줄과 파일 줄이 같은 자리에서 시작한다(feature-doc-browser/02, 살아 있는 규칙)", () => {
  it("issues 안의 티켓 아닌 파일 줄과 티켓 줄의 왼쪽 값이 같다 — 손으로 적은 값이 아니라 같은 출처에서 나온다", () => {
    const feature: Feature = {
      ...BASE,
      docs: [
        {
          kind: "dir",
          name: "issues",
          path: "issues",
          children: [
            {
              kind: "file",
              name: "01-session.md",
              path: "issues/01-session.md",
            },
            { kind: "file", name: "notes.txt", path: "issues/notes.txt" },
          ],
        },
      ],
    };
    renderCard(feature);
    open();

    const fileButton = screen.getByText("notes.txt").closest("button")!;
    const ticketButton = screen.getByText("세션 발급").closest("button")!;
    const expected = treeIndentStyle(TICKET_LIST_DEPTH).paddingLeft;

    expect(fileButton.style.paddingLeft).toBe(expected);
    expect(ticketButton.style.paddingLeft).toBe(expected);
  });

  it("티켓이 없는 기능의 빈 문구도 같은 왼쪽 값에서 시작한다", () => {
    const feature: Feature = { ...BASE, tickets: [], docs: [issuesDir([])] };
    renderCard(feature);
    open();
    const empty = screen.getByText("티켓이 없습니다.");
    expect(empty.style.paddingLeft).toBe(
      treeIndentStyle(TICKET_LIST_DEPTH).paddingLeft,
    );
  });

  it("🔴 머리글(issues)은 depth 0 에 남는다 — 손대지 않는다(F17)", () => {
    const feature: Feature = {
      ...BASE,
      docs: [{ kind: "dir", name: "issues", path: "issues", children: [] }],
    };
    renderCard(feature);
    open();
    const issuesHeader = screen.getByText("issues").closest("button")!;
    // issues 머리글 버튼은 트리 들여쓰기를 쓰지 않는다(px-4 그대로) — depth 0 과 같은 시작점.
    expect(issuesHeader.style.paddingLeft).toBe("");
  });
});

describe("TicketRow — 단계 칸은 늘 자리를 지킨다(ticket-row-repair/03)", () => {
  it("🔴 완료된 티켓도 단계 칸이 그려진다 — 자리가 사라지지 않는다", () => {
    const feature: Feature = {
      ...BASE,
      docs: [issuesDir()],
      tickets: [
        {
          ...BASE.tickets[0]!,
          status: "done",
          sourceStatus: "resolved",
          startable: true,
        },
      ],
    };
    renderCard(feature);
    open();
    const row = screen.getByText("세션 발급").closest("button")!;
    // 세 후보 라벨이 전부 DOM 에 있다(폭 계산용) — 그러나 셋 다 비어 보인다. 대체 문자는 없다.
    for (const label of ["착수 가능", "진행중", "대기"]) {
      expect(within(row).getByText(label)).toHaveClass("invisible");
    }
  });

  it("🔴 같은 상황(취소) — 그 칸이 비어 있다. 대체 문자도, 지어낸 값도 없다", () => {
    const feature: Feature = {
      ...BASE,
      docs: [issuesDir()],
      tickets: [
        {
          ...BASE.tickets[0]!,
          status: "dropped",
          sourceStatus: "wontfix",
          startable: true,
        },
      ],
    };
    renderCard(feature);
    open();
    const row = screen.getByText("세션 발급").closest("button")!;
    for (const label of ["착수 가능", "진행중", "대기"]) {
      expect(within(row).getByText(label)).toHaveClass("invisible");
    }
  });

  it("선행이 다 풀렸고 임자가 없는 티켓 → 착수 가능", () => {
    const feature: Feature = { ...BASE, docs: [issuesDir()] };
    renderCard(feature);
    open();
    const row = screen.getByText("세션 발급").closest("button")!;
    expect(within(row).getByText("착수 가능")).not.toHaveClass("invisible");
  });

  it("살아 있는 사본이 붙든 티켓 → 진행중, 그리고 가지 이름이 계속 보인다", () => {
    const feature: Feature = {
      ...BASE,
      docs: [issuesDir()],
      tickets: [
        {
          ...BASE.tickets[0]!,
          status: "in_progress",
          workedBy: ["fm/session-work"],
        },
      ],
    };
    renderCard(feature);
    open();
    const row = screen.getByText("세션 발급").closest("button")!;
    expect(within(row).getByText("진행중")).not.toHaveClass("invisible");
    expect(within(row).getByText("fm/session-work")).toBeInTheDocument();
  });

  it("선행이 남은 티켓 → 대기, 그리고 기다리는 대상이 계속 보인다", () => {
    const feature: Feature = {
      ...BASE,
      docs: [issuesDir()],
      tickets: [
        {
          ...BASE.tickets[0]!,
          startable: false,
          blockedBy: ["02"],
          waitingOn: ["02"],
        },
      ],
    };
    renderCard(feature);
    open();
    const row = screen.getByText("세션 발급").closest("button")!;
    expect(within(row).getByText("대기")).not.toHaveClass("invisible");
    expect(within(row).getByText("→ 02")).toBeInTheDocument();
  });

  it("🔴 네 상태가 한 목록에 섞여 있어도 네 줄의 단계 칸이 모두 그려진다", () => {
    const feature: Feature = {
      ...BASE,
      docs: [issuesDir()],
      tickets: [
        {
          ...BASE.tickets[0]!,
          num: "01",
          slug: "01-a",
          path: "issues/01-a.md",
          title: "완료",
          status: "done",
        },
        {
          ...BASE.tickets[0]!,
          num: "02",
          slug: "02-b",
          path: "issues/02-b.md",
          title: "진행중인 것",
          status: "in_progress",
          workedBy: ["fm/x"],
        },
        {
          ...BASE.tickets[0]!,
          num: "03",
          slug: "03-c",
          path: "issues/03-c.md",
          title: "대기중인 것",
          startable: false,
          blockedBy: ["02"],
          waitingOn: ["02"],
        },
        {
          ...BASE.tickets[0]!,
          num: "04",
          slug: "04-d",
          path: "issues/04-d.md",
          title: "착수 가능한 것",
        },
      ],
    };
    renderCard(feature);
    open();
    for (const title of [
      "완료",
      "진행중인 것",
      "대기중인 것",
      "착수 가능한 것",
    ]) {
      const row = screen.getByText(title).closest("button")!;
      // 세 후보 모두 DOM 에 있다 — 칸의 존재 자체는 상태와 무관하게 늘 그려진다.
      for (const label of ["착수 가능", "진행중", "대기"]) {
        expect(within(row).getByText(label)).toBeInTheDocument();
      }
    }
  });

  it("임자만 있고 붙든 사본이 없는 티켓은 단계 칸에 끌어들이지 않는다 — 셋 다 비어 보인다", () => {
    const feature: Feature = {
      ...BASE,
      docs: [issuesDir()],
      tickets: [
        {
          ...BASE.tickets[0]!,
          sourceStatus: "claimed",
          startable: false,
          waitingOn: [],
        },
      ],
    };
    renderCard(feature);
    open();
    const row = screen.getByText("세션 발급").closest("button")!;
    for (const label of ["착수 가능", "진행중", "대기"]) {
      expect(within(row).getByText(label)).toHaveClass("invisible");
    }
  });

  it("🔴 상태를 못 읽은 티켓도 숨기지 않는다 — 원문을 그대로 보여준다(INV-4 릴레이)", () => {
    const feature: Feature = {
      ...BASE,
      docs: [issuesDir()],
      tickets: [
        { ...BASE.tickets[0]!, sourceStatus: "진행중", statusKnown: false },
      ],
    };
    renderCard(feature);
    open();
    expect(screen.getByText("알 수 없는 상태: 진행중")).toBeInTheDocument();
  });

  it("완료일이 있으면 그 칸에 값이 뜬다 — 없으면 자리만 남는다(대체 문자 없음)", () => {
    const feature: Feature = {
      ...BASE,
      docs: [issuesDir()],
      tickets: [
        {
          ...BASE.tickets[0]!,
          status: "done",
          sourceStatus: "resolved",
          completedAt: "2026-08-08",
        },
      ],
    };
    renderCard(feature);
    open();
    const row = screen.getByText("세션 발급").closest("button")!;
    expect(within(row).getByText("2026-08-08")).not.toHaveClass("invisible");
  });
});

/** T04 신관례(`tickets/T<NN>.md`) 새 티켓 픽스처 — 파일에 상태가 없다(SoT = 백로그). */
function newTicket(overrides: Partial<FeatureTicket> = {}): FeatureTicket {
  return {
    num: "04",
    slug: "T04",
    path: "tickets/T04.md",
    title: "신관례 문서 표시",
    status: "pending",
    sourceStatus: null,
    statusKnown: false,
    blockedBy: [],
    unreadableBlockedBy: [],
    waitingOn: [],
    startable: true,
    workedBy: [],
    needsCaptainEye: false,
    docConvention: "tickets",
    backlogStatus: null,
    backlogUrl: null,
    ...overrides,
  };
}

describe("FeatureTree — tickets/T<NN>.md 신관례(T04)", () => {
  it("tickets/ 가 실재하면 칸이 뜬다", () => {
    const withTickets: Feature = {
      ...BASE,
      docs: [
        {
          kind: "dir",
          name: "tickets",
          path: "tickets",
          children: [{ kind: "file", name: "T04.md", path: "tickets/T04.md" }],
        },
      ],
      newTickets: [newTicket()],
    };
    renderCard(withTickets);
    open();
    expect(screen.getByText("tickets")).toBeInTheDocument();
    expect(screen.getByText("신관례 문서 표시")).toBeInTheDocument();
  });

  it("tickets/ 가 없으면 칸 자체가 없다(INV-4)", () => {
    const withoutTickets: Feature = { ...BASE, docs: [], newTickets: [] };
    renderCard(withoutTickets);
    expect(screen.queryAllByText("tickets")).toHaveLength(0);
  });

  it("🔴 백로그 미조인 티켓은 '상태 줄 없음' 경고를 보여주지 않는다 — issues 관례와 다른 의미다", () => {
    const feature: Feature = {
      ...BASE,
      docs: [{ kind: "dir", name: "tickets", path: "tickets", children: [] }],
      newTickets: [newTicket()],
    };
    renderCard(feature);
    open();
    expect(screen.queryByText("상태 줄 없음")).toBeNull();
    expect(screen.queryByText(/알 수 없는 상태/)).toBeNull();
  });

  it("백로그 조인되면 상태 배지가 뜬다", () => {
    const feature: Feature = {
      ...BASE,
      docs: [{ kind: "dir", name: "tickets", path: "tickets", children: [] }],
      newTickets: [
        newTicket({ status: "in_progress", backlogStatus: "in_progress" }),
      ],
    };
    renderCard(feature);
    open();
    expect(screen.getByText("in flight")).toBeInTheDocument();
  });

  it("줄을 누르면 tickets/T<NN>.md 경로로 드로어가 열린다", () => {
    const feature: Feature = {
      ...BASE,
      docs: [{ kind: "dir", name: "tickets", path: "tickets", children: [] }],
      newTickets: [newTicket()],
    };
    const { onOpenDoc } = renderCard(feature);
    open();
    fireEvent.click(screen.getByText("신관례 문서 표시"));
    expect(onOpenDoc).toHaveBeenCalledWith(
      "auth-login",
      "tickets/T04.md",
      expect.any(HTMLElement),
    );
  });

  it("미조인 신관례 티켓은 착수 가능/진행중/대기 어느 단계도 아니다(모른다 ≠ 착수 가능)", () => {
    const feature: Feature = {
      ...BASE,
      docs: [{ kind: "dir", name: "tickets", path: "tickets", children: [] }],
      newTickets: [newTicket()],
    };
    renderCard(feature);
    open();
    const row = screen.getByText("신관례 문서 표시").closest("button")!;
    for (const label of ["착수 가능", "진행중", "대기"]) {
      expect(within(row).getByText(label)).toHaveClass("invisible");
    }
  });

  it("🔴 조인된 신관례 티켓이 선행이 있으면 '대기 → 02' 로 보여준다(T01)", () => {
    const feature: Feature = {
      ...BASE,
      docs: [{ kind: "dir", name: "tickets", path: "tickets", children: [] }],
      newTickets: [
        newTicket({
          waitingOn: ["02"],
          startable: false,
          backlogStatus: "pending",
        }),
      ],
    };
    renderCard(feature);
    open();
    const row = screen.getByText("신관례 문서 표시").closest("button")!;
    expect(within(row).getByText("대기")).not.toHaveClass("invisible");
    expect(within(row).getByText("→ 02")).toBeInTheDocument();
  });

  /**
   * 🔴 회귀 — `tickets/` 만 쓰는 기능(구관례 `tickets` 배열은 비어 있다)의 카드 머리글이
   * "남은 일 0 · 완료 0 · 착수 가능 0 · 처리중 0" 을 보여줘 클릭해서 펼치기 전까지는 아무 일도
   * 없는 것처럼 보이던 결함(캡틴 보고, 2026-08-25) — 머리글 집계가 `newTickets` 를 안 세었다.
   */
  it("issues/ 없이 tickets/ 만 있는 기능도 머리글 집계에 잡힌다", () => {
    const feature: Feature = {
      ...BASE,
      tickets: [], // 구관례(issues/) 티켓 없음 — 신관례만 쓰는 기능
      docs: [{ kind: "dir", name: "tickets", path: "tickets", children: [] }],
      newTickets: [newTicket()], // status: pending, startable: true
    };
    renderCard(feature);
    expect(screen.getByText(/남은 일 1/)).toBeInTheDocument();
    expect(screen.getByText(/착수 가능 1/)).toBeInTheDocument();
    // 🔴 남은 일이 있으면 `plan` 버튼이 뜬다(development-order/16 ④) — 0으로 세면 이 버튼도 사라진다.
    expect(screen.getByRole("button", { name: "plan" })).toBeInTheDocument();
  });

  it("🔴 신관례 티켓의 startable 이 실제 값으로 집계된다 — 대기 중인 티켓은 착수 가능 수에서 뺀다(T01)", () => {
    const feature: Feature = {
      ...BASE,
      tickets: [],
      docs: [{ kind: "dir", name: "tickets", path: "tickets", children: [] }],
      newTickets: [
        newTicket({ num: "01", slug: "T01", backlogStatus: "pending" }), // 착수 가능
        newTicket({
          num: "02",
          slug: "T02",
          blockedBy: ["01"],
          waitingOn: ["01"],
          startable: false,
          backlogStatus: "pending",
        }),
      ],
    };
    renderCard(feature);
    expect(screen.getByText(/남은 일 2/)).toBeInTheDocument();
    expect(screen.getByText(/착수 가능 1/)).toBeInTheDocument();
  });
});

describe("FeatureTree — 실재하는 관례의 칸만 그린다(빈 issues 칸 결함, 캡틴 지적)", () => {
  it("🔴 tickets/ 만 있는 기능에 빈 issues 칸이 안 뜬다(INV-4 — 폴더에 없는 걸 그려 넣지 않는다)", () => {
    const feature: Feature = {
      ...BASE,
      tickets: [], // 구관례(issues/) 티켓 없음
      docs: [{ kind: "dir", name: "tickets", path: "tickets", children: [] }],
      newTickets: [newTicket()],
    };
    renderCard(feature);
    open();
    expect(screen.queryAllByText("issues")).toHaveLength(0);
    expect(screen.getByText("tickets")).toBeInTheDocument();
    expect(screen.getByText("신관례 문서 표시")).toBeInTheDocument();
  });

  it("issues/ 만 있는 기능에 tickets 칸이 안 뜬다 — issues 칸은 지금과 똑같다", () => {
    const feature: Feature = {
      ...BASE,
      docs: [issuesDir()],
      newTickets: [],
    };
    renderCard(feature);
    open();
    expect(screen.getByText("issues")).toBeInTheDocument();
    expect(screen.queryAllByText("tickets")).toHaveLength(0);
  });

  it("둘 다 있는 기능은 두 칸이 모두 뜬다 — 코드는 그 경우에도 안전해야 한다", () => {
    const feature: Feature = {
      ...BASE,
      docs: [
        issuesDir(),
        { kind: "dir", name: "tickets", path: "tickets", children: [] },
      ],
      newTickets: [newTicket()],
    };
    renderCard(feature);
    open();
    expect(screen.getByText("issues")).toBeInTheDocument();
    expect(screen.getByText("tickets")).toBeInTheDocument();
  });

  it("둘 다 없는 기능은 어느 칸도 안 뜬다 — '티켓이 없습니다.' 도 없다", () => {
    const feature: Feature = { ...BASE, tickets: [], docs: [], newTickets: [] };
    renderCard(feature);
    open();
    expect(screen.queryAllByText("issues")).toHaveLength(0);
    expect(screen.queryAllByText("tickets")).toHaveLength(0);
    expect(screen.queryByText("티켓이 없습니다.")).toBeNull();
  });
});

// T03 — 갈라진 사본은 조용히 고르지 않고 화면이 말한다(ADR-0001).
describe("FeatureCard/FeatureTree — 갈라짐 표시(T03)", () => {
  it("conflict 가 비어 있으면(기본) 갈라짐 표시가 없다 — 기존 화면 불변(AC3)", () => {
    const feature: Feature = { ...BASE, docs: [issuesDir()] };
    renderCard(feature);
    expect(screen.queryByText(/갈라짐/)).toBeNull();
  });

  it("🔴 conflict 가 있으면 카드 머리에 갈라짐 표시가 뜬다 — 어느 파일·어느 사본인지 말한다(AC1·AC2)", () => {
    const feature: Feature = {
      ...BASE,
      docs: [issuesDir()],
      conflict: [{ path: "spec.md", copies: ["/home/a/proj", "/home/b/proj"] }],
    };
    renderCard(feature);
    const badge = screen.getByText("갈라짐");
    expect(badge).toBeInTheDocument();
    expect(badge.closest("span")).toHaveAttribute(
      "title",
      expect.stringContaining("/home/a/proj"),
    );
    expect(badge.closest("span")).toHaveAttribute(
      "title",
      expect.stringContaining("/home/b/proj"),
    );
  });

  it("갈라진 파일 줄에도 표시가 붙고, 갈라지지 않은 나머지 문서는 정상적으로 보인다(AC5)", () => {
    const feature: Feature = {
      ...BASE,
      docs: [
        issuesDir([
          { kind: "file", name: "01-session.md", path: "issues/01-session.md" },
        ]),
      ],
      conflict: [{ path: "issues/01-session.md", copies: ["/home/a/proj", "/home/b/proj"] }],
    };
    const { onOpenDoc } = renderCard(feature);
    open();
    const row = screen.getByText("세션 발급").closest("button")!;
    expect(within(row).getByText("갈라짐")).toBeInTheDocument();
    // 갈라진 파일도 열린다 — 대표 사본의 내용을 정상적으로 보여준다(구현 메모).
    fireEvent.click(row);
    expect(onOpenDoc).toHaveBeenCalledWith(
      "auth-login",
      "issues/01-session.md",
      expect.any(HTMLElement),
    );
  });

  it("갈라진 파일이 둘 이상이면 개수를 함께 보여준다", () => {
    const feature: Feature = {
      ...BASE,
      docs: [issuesDir()],
      conflict: [
        { path: "spec.md", copies: ["/a", "/b"] },
        { path: "grill.md", copies: ["/a", "/b"] },
      ],
    };
    renderCard(feature);
    expect(screen.getByText("갈라짐 2")).toBeInTheDocument();
  });
});
