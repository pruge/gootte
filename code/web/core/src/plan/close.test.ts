import { describe, expect, it } from "vitest";
import {
  closedDisplayAt,
  documentCompletedOn,
  featureFullyChecked,
  planAutoClose,
  planReopen,
  ticketBoxState,
} from "./close";
import { feature, resolved, row, wontfix } from "./fixtures";

describe("ticketBoxState — 상자는 문서에서 읽는다(INV-5), 셋으로 갈린다(plan-board/12)", () => {
  it("완료면 done", () => {
    expect(ticketBoxState({ status: "done" })).toBe("done");
  });

  it("미완은 전부 open — 대기든 붙들려 있든", () => {
    expect(ticketBoxState({ status: "pending" })).toBe("open");
    expect(ticketBoxState({ status: "in_sprint" })).toBe("open");
    expect(ticketBoxState({ status: "in_progress" })).toBe("open");
  });

  it("🔴 폐기는 dropped — done 도 open 도 아니다(뒤집힘 이후에도 모양은 갈린다)", () => {
    expect(ticketBoxState({ status: "dropped" })).toBe("dropped");
  });
});

describe("featureFullyChecked — 저절로 닫히는 유일한 조건(plan-board/12 뒤집힘: 폐기도 닫는다)", () => {
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

  it("🔴 폐기만 있어도 닫는다 — 캡틴 결정 2026-08-14", () => {
    expect(featureFullyChecked(feature("wontfix-only", [wontfix("01")]))).toBe(true);
  });

  it("🔴 완료와 폐기가 섞여도 닫는다 — resolved 셋 + wontfix 하나", () => {
    expect(
      featureFullyChecked(
        feature("mixed", [
          resolved("01", "2026-08-01"),
          resolved("02", "2026-08-02"),
          resolved("03", "2026-08-03"),
          wontfix("04"),
        ]),
      ),
    ).toBe(true);
  });

  it("🔴 미완이 하나라도 남으면 폐기가 섞여 있어도 닫지 않는다", () => {
    expect(
      featureFullyChecked(feature("mixed-open", [resolved("01", "2026-08-01"), wontfix("02"), "03"])),
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

  it("🔴 폐기와 완료가 섞인 기능도 닫힌다 — 뒤집힘(plan-board/12, 캡틴 결정 2026-08-14). 옛 이름(INV-B4)은 옛 규율의 것이었다", () => {
    const mixed = feature("m", [resolved("01", "2026-08-01"), wontfix("02")]);
    const plan = planAutoClose([mixed], [row("m", "active", 0)]);
    expect(plan?.upsert).toEqual([{ feature: "m", area: "done", seq: 0, closedAt: null }]);
  });

  it("🔴 폐기뿐인 기능도 닫힌다", () => {
    const wontfixOnly = feature("w", [wontfix("01")]);
    const plan = planAutoClose([wontfixOnly], []);
    expect(plan?.upsert).toEqual([{ feature: "w", area: "done", seq: 0, closedAt: null }]);
  });

  it("🔴 전부 폐기로 닫힌 카드는 닫힌 날짜가 없다 — 지어내지 않는다", () => {
    const wontfixOnly = feature("w", [wontfix("01")]);
    expect(documentCompletedOn(wontfixOnly)).toBeNull();
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

  it("🔴 닫으면서 지우거나 새 단계를 붙이지 않는다 — 닫는 판정은 닫는 것만 한다(되돌리는 길은 planReopen)", () => {
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

describe("planReopen — 예약·폐기·완료의 카드는 안 읽은 티켓이 있으면 대기로 올라온다(plan-board/11, 캡틴 결정 2026-08-13)", () => {
  const read = (num: string) => ({ num, unread: false });
  const unreadPending = (num: string) => ({ num, unread: true });
  const unreadDone = (num: string, completedAt: string) => ({
    ...resolved(num, completedAt),
    unread: true,
  });
  const unreadWontfix = (num: string) => ({ ...wontfix(num), unread: true });

  it("되돌릴 것이 없으면 아무것도 쓰지 않는다(null)", () => {
    expect(planReopen([feature("a", [read("01")])], [row("a", "done", 0)])).toBeNull();
    expect(planReopen([feature("a", [unreadPending("01")])], [row("a", "active", 0)])).toBeNull();
    expect(planReopen([], [])).toBeNull();
  });

  it("🔴 예약 카드 + 안 읽은 티켓 → 대기로 올라온다", () => {
    const f = feature("a", [read("01"), unreadPending("02")]);
    const plan = planReopen([f], [row("a", "reserved", 0)]);
    expect(plan?.remove).toEqual(["a"]);
    expect(plan?.upsert).toEqual([]);
  });

  it("🔴 폐기 카드 + 안 읽은 티켓 → 대기로 올라온다", () => {
    const f = feature("a", [read("01"), unreadPending("02")]);
    const plan = planReopen([f], [row("a", "discarded", 0)]);
    expect(plan?.remove).toEqual(["a"]);
  });

  it("🔴 손으로 닫은 완료 카드(closedAt 있음) + 안 읽은 티켓 → 대기로 올라온다 — 10 의 반대, 캡틴 결정을 잠근다", () => {
    const f = feature("a", [read("01"), unreadPending("02")]);
    const plan = planReopen([f], [row("a", "done", 0, "2026-08-01 09:00")]);
    expect(plan?.remove).toEqual(["a"]);
  });

  it("🔴 예약 카드 + 안 끝났지만 다 읽은 티켓 → 예약 그대로다 — 칸이 비워지지 않는다", () => {
    const f = feature("a", [read("01"), read("02")]);
    expect(planReopen([f], [row("a", "reserved", 0)])).toBeNull();
  });

  it("🔴 폐기 칸 + 안 끝났지만 다 읽은 티켓 → 폐기 그대로다 — 칸이 비워지지 않는다", () => {
    const f = feature("a", [read("01"), read("02")]);
    expect(planReopen([f], [row("a", "discarded", 0)])).toBeNull();
  });

  it("🔴 안 읽은 폐기 티켓뿐이면 그 자리 그대로다 — 폐기는 할 일이 아니다", () => {
    const f = feature("a", [read("01"), unreadWontfix("02")]);
    expect(planReopen([f], [row("a", "done", 0)])).toBeNull();
  });

  it("🔴 상태·제목만 바뀌어도 읽음은 안 풀린다 — 읽은 티켓은 상태와 무관하게 조용하다", () => {
    const f = feature("a", [{ num: "01", status: "in_progress", unread: false }]);
    expect(planReopen([f], [row("a", "reserved", 0)])).toBeNull();
  });

  it("🔴 티켓이 한 장도 없는 기능은 올리지 않는다", () => {
    expect(planReopen([feature("a")], [row("a", "done", 0)])).toBeNull();
  });

  it("🔴 작업 대상 카드는 안 읽은 티켓이 있어도 건드리지 않는다 — 캡틴 범위 밖", () => {
    const f = feature("a", [unreadPending("01")]);
    expect(planReopen([f], [row("a", "active", 0)])).toBeNull();
  });

  it("🔴 대기 카드(자리 행 없음)는 애초에 대상이 아니다", () => {
    const f = feature("a", [unreadPending("01")]);
    expect(planReopen([f], [])).toBeNull();
  });

  it("여럿이 한 번에 올라와도 순서가 결정적이다 — 폴더명순", () => {
    const c = feature("c", [unreadPending("01")]);
    const a = feature("a", [unreadPending("01")]);
    const plan = planReopen([c, a], [row("c", "reserved", 0), row("a", "discarded", 1)]);
    expect(plan?.remove).toEqual(["a", "c"]);
  });

  it("대기로 가는 것은 행을 지우는 것뿐 — 단계 행을 새로 만들지 않는다(INV-B6)", () => {
    const f = feature("a", [unreadPending("01")]);
    const plan = planReopen([f], [row("a", "reserved", 0)]);
    expect(plan?.clearSteps).toEqual([]);
    expect(plan?.setSteps).toEqual([]);
  });

  it("🔴 planAutoClose 와 같은 카드를 두고 동시에 참일 수 없다 — planAutoClose 는 이미 완료 칸의 카드를 다시 쓰지 않는다", () => {
    const closed = feature("a", [unreadDone("01", "2026-08-01")]);
    // 이미 완료 칸에 있으므로 planAutoClose 는 이 카드를 보지 않는다(closableFrom 밖).
    expect(planAutoClose([closed], [row("a", "done", 0)])).toBeNull();
    // planReopen 은 안 읽은 티켓이 있으므로 참을 낸다 — 서로 다른 순간을 본다, 싸우지 않는다.
    expect(planReopen([closed], [row("a", "done", 0)])?.remove).toEqual(["a"]);
  });

  it("왕복 — 예약으로 내려놓음 → 안 읽은 티켓이 생겨 대기로 올라옴 → 읽으면 다시 내려놓아도 그대로다", () => {
    // 1) 캡틴이 예약에 내려놓는다
    let placements = [row("a", "reserved", 0)];

    // 2) 새(안 읽은) 티켓이 생긴다 → 대기로 올라온다(행이 사라진다)
    const withNewTicket = feature("a", [read("01"), unreadPending("02")]);
    const reopenPlan = planReopen([withNewTicket], placements);
    expect(reopenPlan?.remove).toEqual(["a"]);
    placements = placements.filter((p) => !reopenPlan?.remove.includes(p.feature));
    expect(placements).toEqual([]);

    // 3) 캡틴이 그 티켓을 읽는다 → planReopen 이 더 이상 참을 내지 않는다
    const nowRead = feature("a", [read("01"), read("02")]);
    placements = [row("a", "reserved", 0)];
    expect(planReopen([nowRead], placements)).toBeNull();
  });
});
