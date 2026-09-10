import { describe, expect, it } from "vitest";
import type { Feature } from "@gootte/contract";
import { computeFrontier } from "./frontier";
import { feature, resolved, wontfix } from "../plan/fixtures";

/** fixture 가 못 만드는 값(claimed → startable=false)을 심는 보조 — 판정 입력은 어차피 이 둘뿐이다. */
function withStartable(f: Feature, ticketSlug: string, startable: boolean): Feature {
  return {
    ...f,
    tickets: f.tickets.map((t) => (t.slug === ticketSlug ? { ...t, startable } : t)),
    ...(f.newTickets
      ? { newTickets: f.newTickets.map((t) => (t.slug === ticketSlug ? { ...t, startable } : t)) }
      : {}),
  };
}

describe("computeFrontier — 착수 가능(대기+차단 없음+임자 없음)", () => {
  it("대기 + 선행 없음(= `Blocked by:` 줄 없는 옛 포맷 포함) 티켓이 실린다", () => {
    const out = computeFrontier([feature("alpha", ["01", "02"])]);
    expect(out.map((t) => `${t.feature}/${t.ticket}`)).toEqual(["alpha/01-x", "alpha/02-x"]);
    expect(out[0]).toMatchObject({ title: "티켓 01", needsCaptainEye: false });
  });

  it("선행이 아직 안 끝난 티켓은 빠지고, 끝나면 들어온다", () => {
    const blocked = feature("alpha", [{ num: "01", blockedBy: ["02"] }, "02"]);
    expect(computeFrontier([blocked]).map((t) => t.ticket)).toEqual(["02-x"]);

    const freed = feature("alpha", [{ num: "01", blockedBy: ["02"] }, resolved("02", "2026-09-09")]);
    expect(computeFrontier([freed]).map((t) => t.ticket)).toEqual(["01-x"]);
  });

  it("done · dropped · in_progress · claimed(임자 있음) 은 빠진다", () => {
    const f = feature("alpha", [
      resolved("01", "2026-09-01"),
      wontfix("02"),
      { num: "03", status: "in_progress" },
      "04",
    ]);
    expect(computeFrontier([f]).map((t) => t.ticket)).toEqual(["04-x"]);

    const claimed = withStartable(f, "04-x", false);
    expect(computeFrontier([claimed])).toEqual([]);
  });

  it("신관례(`tickets/`) 티켓도 같은 판정을 받는다", () => {
    const f = feature("alpha", [{ num: "01", newConvention: true }, { num: "02", newConvention: true, blockedBy: ["01"] }]);
    expect(computeFrontier([f]).map((t) => t.ticket)).toEqual(["T01"]);
  });

  it("읽지 못하는 산문 선행은 막힌 채 남는다 — startable=false 라서 빠진다", () => {
    const f = withStartable(feature("alpha", ["01"]), "01-x", false);
    expect(computeFrontier([f])).toEqual([]);
  });
});
