import { describe, expect, it } from "vitest";
import {
  closedDisplayAt,
  documentCompletedOn,
  featureFullyChecked,
  planAutoClose,
  ticketChecked,
} from "./close";
import { feature, resolved, row, wontfix } from "./fixtures";

describe("ticketChecked — 상자는 문서에서 읽는다(INV-5)", () => {
  it("완료면 채워진다", () => {
    expect(ticketChecked({ status: "done" })).toBe(true);
  });

  it("미완은 전부 빈 상자 — 대기든 붙들려 있든", () => {
    expect(ticketChecked({ status: "pending" })).toBe(false);
    expect(ticketChecked({ status: "in_sprint" })).toBe(false);
    expect(ticketChecked({ status: "in_progress" })).toBe(false);
  });

  it("🔴 폐기는 채워진 것이 아니다 — 끝난 것과 안 하는 것은 다르다", () => {
    expect(ticketChecked({ status: "dropped" })).toBe(false);
  });
});

describe("featureFullyChecked — 저절로 닫히는 유일한 조건", () => {
  it("🔴 티켓이 0장이면 닫지 않는다 — 끝났다는 증거가 없다", () => {
    expect(featureFullyChecked(feature("empty"))).toBe(false);
  });

  it("일부만 완료면 닫지 않는다", () => {
    expect(
      featureFullyChecked(feature("half", [resolved("01", "2026-08-01"), "02"])),
    ).toBe(false);
  });

  it("전부 완료면 닫는다", () => {
    expect(
      featureFullyChecked(
        feature("all", [resolved("01", "2026-08-01"), resolved("02", "2026-08-03")]),
      ),
    ).toBe(true);
  });

  it("🔴 폐기 티켓이 섞이면 닫지 않는다 — 빈 상자로 남고 캡틴이 정하신다", () => {
    expect(
      featureFullyChecked(feature("mixed", [resolved("01", "2026-08-01"), wontfix("02")])),
    ).toBe(false);
  });
});

describe("documentCompletedOn — 문서가 말하는 완료 날짜", () => {
  it("완료 티켓들의 날짜 중 가장 늦은 것", () => {
    const f = feature("f", [
      resolved("01", "2026-08-01"),
      resolved("02", "2026-08-09"),
      resolved("03", "2026-08-05"),
    ]);
    expect(documentCompletedOn(f)).toBe("2026-08-09");
  });

  it("완료가 하나도 없으면 null — 지어내지 않는다", () => {
    expect(documentCompletedOn(feature("f", ["01", "02"]))).toBeNull();
    expect(documentCompletedOn(feature("empty"))).toBeNull();
  });

  it("남은 티켓을 안고 닫힌 카드도 끝난 티켓의 날짜는 말한다", () => {
    const f = feature("f", [resolved("01", "2026-08-02"), "02"]);
    expect(documentCompletedOn(f)).toBe("2026-08-02");
  });
});

describe("planAutoClose — gootte 가 스스로 쓰는 단 한 순간", () => {
  const done = (slug: string) => feature(slug, [resolved("01", "2026-08-01")]);

  it("닫을 것이 없으면 아무것도 쓰지 않는다(null)", () => {
    expect(planAutoClose([feature("a", ["01"])], [])).toBeNull();
    expect(planAutoClose([feature("empty")], [])).toBeNull();
  });

  it("🔴 자리 행이 없는(대기) 기능도 닫힌다 — 등록이라는 절차가 없다(INV-B1)", () => {
    const plan = planAutoClose([done("a")], []);
    expect(plan?.upsert).toEqual([{ feature: "a", area: "done", seq: 0, closedAt: null }]);
  });

  it("작업 대상에서 닫히면 단계 행이 사라진다 — 작업 대상 밖에 단계는 없다(INV-B6)", () => {
    const plan = planAutoClose([done("a")], [row("a", "active", 0)]);
    expect(plan?.upsert).toEqual([{ feature: "a", area: "done", seq: 0, closedAt: null }]);
    expect(plan?.clearSteps).toEqual(["a"]);
  });

  it("대기에서 닫힌 기능은 지울 단계 행도 없다", () => {
    expect(planAutoClose([done("a")], [])?.clearSteps).toEqual([]);
  });

  it("🔴 이미 완료 칸에 있으면 다시 쓰지 않는다 — closed_at 은 처음 닫힌 시각이다", () => {
    const placed = [row("a", "done", 0, "2026-08-01 09:00")];
    expect(planAutoClose([done("a")], placed)).toBeNull();
  });

  it("🔴 캡틴이 손으로 정한 자리(예약·폐기)는 덮지 않는다 — 기계가 몰래 옮기지 않는다", () => {
    expect(planAutoClose([done("a")], [row("a", "reserved", 0)])).toBeNull();
    expect(planAutoClose([done("a")], [row("a", "discarded", 0)])).toBeNull();
  });

  it("🔴 폐기 티켓을 안은 기능은 닫히지 않는다 — 완료로 위장하지 않는다(INV-B4)", () => {
    const mixed = feature("m", [resolved("01", "2026-08-01"), wontfix("02")]);
    expect(planAutoClose([mixed], [row("m", "active", 0)])).toBeNull();
  });

  it("닫히는 카드는 완료 칸 맨 뒤에 선다 — 이미 닫힌 카드의 자리를 밀어내지 않는다", () => {
    const plan = planAutoClose(
      [done("b"), done("c")],
      [row("z", "done", 4, "2026-08-01 09:00"), row("y", "active", 0)],
    );
    expect(plan?.upsert).toEqual([
      { feature: "b", area: "done", seq: 5, closedAt: null },
      { feature: "c", area: "done", seq: 6, closedAt: null },
    ]);
  });

  it("여럿이 한 번에 닫혀도 순서가 결정적이다 — 폴더명순", () => {
    const plan = planAutoClose([done("c"), done("a"), done("b")], []);
    expect(plan?.upsert.map((p) => p.feature)).toEqual(["a", "b", "c"]);
  });

  it("🔴 닫으면서 지우거나 새 단계를 붙이지 않는다 — 되돌아 나오는 길을 만들지 않는다(INV-B5)", () => {
    const plan = planAutoClose([done("a")], [row("a", "active", 0)]);
    expect(plan?.remove).toEqual([]);
    expect(plan?.setSteps).toEqual([]);
  });

  it("🔴 저절로 닫을 때는 closed_at 을 찍지 않는다 — DB 에 남는 것은 자리뿐이다(06)", () => {
    const plan = planAutoClose([done("a")], []);
    expect(plan?.upsert[0]?.closedAt).toBeNull();
  });

  it("🔴 쓰는 칸은 자리와 닫은 시각 둘뿐 — 체크 상태를 담을 칸이 없다(INV-5)", () => {
    const plan = planAutoClose([done("a")], []);
    expect(Object.keys(plan?.upsert[0] ?? {}).sort()).toEqual([
      "area",
      "closedAt",
      "feature",
      "seq",
    ]);
  });
});

describe("closedDisplayAt — 카드가 보여줄 닫힌 시각 하나(06)", () => {
  it("저절로 닫힌 카드(closedAt 없음)는 문서의 완료 시각을 보여준다", () => {
    const f = feature("f", [resolved("01", "2026-08-12 14:30")]);
    expect(closedDisplayAt(null, f)).toBe("2026-08-12 14:30");
  });

  it("캡틴이 손으로 닫은 카드(closedAt 있음)는 저장값을 그대로 보여준다", () => {
    const f = feature("f", [resolved("01", "2026-08-12 14:30")]);
    expect(closedDisplayAt("2026-08-01 09:00", f)).toBe("2026-08-01 09:00");
  });

  it("둘 다 없으면 null 이다 — 지어내지 않는다", () => {
    expect(closedDisplayAt(null, feature("f", ["01"]))).toBeNull();
  });
});
