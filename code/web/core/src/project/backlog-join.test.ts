import { describe, expect, it } from "vitest";
import type { BacklogTaskDoc } from "../parse/backlog";
import type { FeatureTicket } from "@gootte/contract";
import { applyBacklogStatus, joinTicketBacklog } from "./backlog-join";
import { feature } from "../plan/fixtures";

function task(overrides: Partial<BacklogTaskDoc>): BacklogTaskDoc {
  return {
    id: "widget-tauri-t04",
    checked: false,
    section: "in_flight",
    repo: "widget",
    url: null,
    since: null,
    note: "",
    ...overrides,
  };
}

const PARENT = task({
  id: "widget-tauri",
  note: "Artifacts: projects/widget/docs/features/tauri-desktop-app/.",
});

describe("joinTicketBacklog", () => {
  it("부모 메모의 docs/features/<slug>/ 문구로 부모를 찾고 <parent>-t<NN> 로 자식을 찾는다", () => {
    const child = task({ id: "widget-tauri-t04", section: "in_flight" });
    const result = joinTicketBacklog([PARENT, child], "widget", "tauri-desktop-app", "04");
    expect(result).toEqual({ status: "in_progress", url: null, completedAt: null });
  });

  it("완료(Done) 절은 done + 완료일을 싣는다", () => {
    const child = task({ id: "widget-tauri-t03", section: "done", checked: true, since: "2026-08-25", url: "https://x/pr/1" });
    const result = joinTicketBacklog([PARENT, child], "widget", "tauri-desktop-app", "03");
    expect(result).toEqual({ status: "done", url: "https://x/pr/1", completedAt: "2026-08-25" });
  });

  it("Queued 절은 pending 이다", () => {
    const child = task({ id: "widget-tauri-t05", section: "queued" });
    const result = joinTicketBacklog([PARENT, child], "widget", "tauri-desktop-app", "05");
    expect(result?.status).toBe("pending");
  });

  it("부모를 못 찾으면 null(추측하지 않는다)", () => {
    const child = task({ id: "widget-tauri-t04" });
    expect(joinTicketBacklog([child], "widget", "tauri-desktop-app", "04")).toBeNull();
  });

  it("repo 가 다르면 부모로 안 본다", () => {
    const child = task({ id: "widget-tauri-t04" });
    expect(joinTicketBacklog([PARENT, child], "other-repo", "tauri-desktop-app", "04")).toBeNull();
  });

  it("자식 id 가 없으면 null", () => {
    expect(joinTicketBacklog([PARENT], "widget", "tauri-desktop-app", "09")).toBeNull();
  });

  it("번호가 비어 있으면 null", () => {
    expect(joinTicketBacklog([PARENT], "widget", "tauri-desktop-app", "")).toBeNull();
  });
});

describe("applyBacklogStatus", () => {
  it("newTickets 만 조인하고 tickets(issues 관례)는 그대로 둔다", () => {
    const base = feature("tauri-desktop-app", ["01"]);
    const withNew = {
      ...base,
      newTickets: [
        {
          num: "04",
          slug: "T04",
          path: "tickets/T04.md",
          title: "신관례 문서 표시",
          status: "pending" as const,
          sourceStatus: null,
          statusKnown: false,
          blockedBy: [],
          unreadableBlockedBy: [],
          waitingOn: [],
          startable: true,
          workedBy: [],
          needsCaptainEye: false,
          docConvention: "tickets" as const,
          backlogStatus: null,
          backlogUrl: null,
        },
      ],
    };
    const child = task({ id: "widget-tauri-t04", section: "in_flight" });
    const [joined] = applyBacklogStatus([withNew], [PARENT, child], "widget");

    expect(joined?.newTickets?.[0]?.status).toBe("in_progress");
    expect(joined?.newTickets?.[0]?.backlogStatus).toBe("in_progress");
    expect(joined?.tickets[0]?.sourceStatus).toBe("draft"); // issues 관례는 안 건드린다
  });

  it("미조인이면 손대지 않는다", () => {
    const base = feature("tauri-desktop-app");
    const withNew = {
      ...base,
      newTickets: [
        {
          num: "09",
          slug: "T09",
          path: "tickets/T09.md",
          title: "아직 백로그에 없는 티켓",
          status: "pending" as const,
          sourceStatus: null,
          statusKnown: false,
          blockedBy: [],
          unreadableBlockedBy: [],
          waitingOn: [],
          startable: true,
          workedBy: [],
          needsCaptainEye: false,
          docConvention: "tickets" as const,
          backlogStatus: null,
          backlogUrl: null,
        },
      ],
    };
    const [joined] = applyBacklogStatus([withNew], [PARENT], "widget");
    expect(joined?.newTickets?.[0]?.backlogStatus).toBeNull();
  });

  /** 신관례 티켓 한 장 — blockedBy 를 줄 수 있다(T01). */
  const newTicket = (
    num: string,
    overrides: Partial<FeatureTicket> = {},
  ): FeatureTicket => ({
    num,
    slug: `T${num}`,
    path: `tickets/T${num}.md`,
    title: `티켓 T${num}`,
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
  });

  it("🔴 조인으로 선행이 완료되면 신관례 티켓의 대기도 풀린다 — 낡은 뷰 금지(INV-3, T01)", () => {
    const base = feature("tauri-desktop-app");
    const withNew = {
      ...base,
      newTickets: [
        newTicket("01"),
        newTicket("02", { blockedBy: ["01"], waitingOn: ["01"], startable: false }),
      ],
    };
    // T01 은 Done, T02 는 Queued — T02 의 대기가 풀려 착수 가능이어야 한다.
    const tasks = [PARENT, task({ id: "widget-tauri-t01", section: "done", checked: true }), task({ id: "widget-tauri-t02", section: "queued" })];
    const [joined] = applyBacklogStatus([withNew], tasks, "widget");
    expect(joined?.newTickets?.[0]?.status).toBe("done");
    const t2 = joined?.newTickets?.[1];
    expect(t2?.waitingOn).toEqual([]);
    expect(t2?.startable).toBe(true);
  });

  it("조인 후에도 선행이 미완이면 대기로 남는다(T01)", () => {
    const base = feature("tauri-desktop-app");
    const withNew = {
      ...base,
      newTickets: [
        newTicket("01"),
        newTicket("02", { blockedBy: ["01"], waitingOn: ["01"], startable: false }),
      ],
    };
    const tasks = [PARENT, task({ id: "widget-tauri-t01", section: "in_flight" }), task({ id: "widget-tauri-t02", section: "queued" })];
    const [joined] = applyBacklogStatus([withNew], tasks, "widget");
    const t2 = joined?.newTickets?.[1];
    expect(t2?.waitingOn).toEqual(["01"]);
    expect(t2?.startable).toBe(false);
  });
});
