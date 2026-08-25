import { describe, expect, test } from "vitest";
import type { Feature, FeatureTicket } from "@gootte/contract";
import { applyReadState } from "./read-state";

function ticket(path: string): FeatureTicket {
  return {
    num: "01",
    slug: path.replace(/^issues\//, "").replace(/\.md$/, ""),
    path,
    title: `티켓 ${path}`,
    status: "pending",
    sourceStatus: null,
    statusKnown: true,
    blockedBy: [],
    unreadableBlockedBy: [],
    waitingOn: [],
    startable: true,
    workedBy: [],
    needsCaptainEye: false,
  };
}

function feature(slug: string, tickets: FeatureTicket[]): Feature {
  return {
    slug,
    title: `${slug} — 제목`,
    status: "pending",
    sourceStatus: null,
    statusKnown: true,
    docs: [],
    tickets,
  };
}

/**
 * 안 읽은 티켓 판정(unread-tickets-show-themselves/01) — 순수 함수 하나가 카드 머리글도
 * 정한다(spec §판정 자리는 하나뿐과 같은 원리).
 */
describe("applyReadState", () => {
  test("읽음 기록에 없는 티켓만 안 읽음이다", () => {
    const features = [feature("f", [ticket("issues/01-x.md"), ticket("issues/02-x.md")])];
    const [result] = applyReadState(features, new Set(["f/issues/01-x.md"]));
    expect(result!.tickets.map((t) => t.unread)).toEqual([false, true]);
  });

  test("🔴 안 읽은 티켓이 있으면 머리글도 초록, 하나도 없으면 아니다", () => {
    const withUnread = applyReadState(
      [feature("f", [ticket("issues/01-x.md"), ticket("issues/02-x.md")])],
      new Set(["f/issues/01-x.md"]),
    );
    expect(withUnread[0]!.hasUnreadTicket).toBe(true);

    const allRead = applyReadState(
      [feature("f", [ticket("issues/01-x.md"), ticket("issues/02-x.md")])],
      new Set(["f/issues/01-x.md", "f/issues/02-x.md"]),
    );
    expect(allRead[0]!.hasUnreadTicket).toBe(false);
  });

  test("🔴 읽음 기록을 못 읽었으면(null) 조용한 쪽으로 기운다 — 전부 읽은 것으로 본다(INV-U1)", () => {
    const [result] = applyReadState([feature("f", [ticket("issues/01-x.md")])], null);
    expect(result!.tickets.every((t) => t.unread === false)).toBe(true);
    expect(result!.hasUnreadTicket).toBe(false);
  });

  test("다른 기능의 같은 경로 이름은 섞이지 않는다 — 키는 기능 slug 까지 포함한다", () => {
    const features = [feature("f", [ticket("issues/01-x.md")]), feature("g", [ticket("issues/01-x.md")])];
    const result = applyReadState(features, new Set(["f/issues/01-x.md"]));
    expect(result[0]!.tickets[0]!.unread).toBe(false);
    expect(result[1]!.tickets[0]!.unread).toBe(true);
  });

  test("티켓이 없는 기능은 안 읽은 것도 없다", () => {
    const [result] = applyReadState([feature("f", [])], new Set());
    expect(result!.hasUnreadTicket).toBe(false);
  });

  test("🔴 신관례 티켓도 안 읽음이 된다 — tickets/ 만 쓰는 기능의 초록이 죽지 않는다(실제 결함)", () => {
    const f = feature("f", [ticket("issues/01-a.md")]);
    f.newTickets = [ticket("tickets/T01-b.md")];

    // 신관례 티켓만 안 읽음이고, 머리글도 함께 초록이다.
    const [result] = applyReadState([f], new Set(["f/issues/01-a.md"]));
    expect(result!.newTickets?.map((t) => t.unread)).toEqual([true]);
    expect(result!.hasUnreadTicket).toBe(true);

    // 신관례 티켓을 읽으면 초록이 내려간다.
    const [read] = applyReadState(
      [f],
      new Set(["f/issues/01-a.md", "f/tickets/T01-b.md"]),
    );
    expect(read!.newTickets?.map((t) => t.unread)).toEqual([false]);
    expect(read!.hasUnreadTicket).toBe(false);
  });

  test("🔴 신관례 티켓도 null 기록에서는 조용한 쪽으로 기운다(INV-U1)", () => {
    const f = feature("f", []);
    f.newTickets = [ticket("tickets/T01-b.md")];
    const [result] = applyReadState([f], null);
    expect(result!.newTickets?.every((t) => t.unread === false)).toBe(true);
    expect(result!.hasUnreadTicket).toBe(false);
  });
});
