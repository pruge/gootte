import { describe, expect, test } from "vitest";
import type { Feature, Placement, PlanMoveRequest } from "@gootte/contract";
import { assignSteps } from "./auto-step";
import { splitIntoAreas } from "./board";
import { feature, resolved, row, wontfix } from "./fixtures";
import { planMove, type PlanWritePlan } from "./move";

const NOW = "2026-08-12 17:40";

const move = (
  features: string[],
  area: PlanMoveRequest["area"],
  index = 0,
): PlanMoveRequest => ({ features, area, index });

/**
 * 계획 DB 가 이 쓰기를 받은 뒤의 자리 행 — **덮어쓰기와 삭제뿐**이다.
 * 실제 SQL 쓰기가 이 의미와 같은지는 `core-io/src/plan-store.test.ts` 가 지킨다.
 * 여기서 이것을 두는 이유는 하나다: 옮긴 결과를 **02 가 세운 `splitIntoAreas` 로 다시 재기** 위해서 —
 * 칸 나누기를 두 번째로 판정하는 자리를 만들지 않는다.
 */
function apply(placements: readonly Placement[], plan: PlanWritePlan): Placement[] {
  const rows = new Map(placements.map((p) => [p.feature, p]));
  for (const slug of plan.remove) rows.delete(slug);
  for (const p of plan.upsert) rows.set(p.feature, p);
  return [...rows.values()];
}

const areaOf = (features: readonly Feature[], placements: readonly Placement[]) => {
  const areas = splitIntoAreas(features, placements);
  return (key: keyof typeof areas) => areas[key].map((c) => c.feature.slug);
};

describe("planMove — 캡틴이 놓은 자리가 곧 정답이다(티켓 03)", () => {
  test("대기 카드를 작업 대상으로 올린다 — 자리 행이 생기고 판이 그대로 따라온다", () => {
    const features = [feature("auth-login"), feature("doc-tree")];
    const plan = planMove(features, [], move(["auth-login"], "active"), NOW);

    expect(plan.upsert).toEqual([{ feature: "auth-login", area: "active", seq: 0, closedAt: null }]);
    const at = areaOf(features, apply([], plan));
    expect(at("active")).toEqual(["auth-login"]);
    expect(at("waiting")).toEqual(["doc-tree"]); // 나머지는 그대로 대기 — 건드리지 않는다
  });

  test("여러 장을 한 번에 옮긴다 — 캡틴이 집은 순서 그대로 붙는다(캡틴 제안 2)", () => {
    const features = [feature("a"), feature("b"), feature("c")];
    const plan = planMove(features, [], move(["c", "a"], "active"), NOW);
    expect(plan.upsert.map((p) => [p.feature, p.seq])).toEqual([
      ["c", 0],
      ["a", 1],
    ]);
    expect(areaOf(features, apply([], plan))("active")).toEqual(["c", "a"]);
  });

  test("같은 기능을 두 번 집어도 한 번만 간다", () => {
    const features = [feature("a")];
    const plan = planMove(features, [], move(["a", "a"], "active"), NOW);
    expect(plan.upsert.map((p) => p.feature)).toEqual(["a"]);
  });

  test("작업 대상 안에서 순서를 바꾼다 — 끼워 넣은 자리에서 seq 를 다시 센다", () => {
    const features = [feature("a"), feature("b"), feature("c")];
    const rows = [row("a", "active", 0), row("b", "active", 1), row("c", "active", 2)];
    // c 를 맨 앞으로.
    const plan = planMove(features, rows, move(["c"], "active", 0), NOW);
    expect(areaOf(features, apply(rows, plan))("active")).toEqual(["c", "a", "b"]);
  });

  test("가운데로 끼워 넣는다 — 자리는 옮길 카드를 뺀 나머지 기준으로 센다", () => {
    const features = [feature("a"), feature("b"), feature("c")];
    const rows = [row("a", "active", 0), row("b", "active", 1), row("c", "active", 2)];
    const plan = planMove(features, rows, move(["a"], "active", 1), NOW);
    expect(areaOf(features, apply(rows, plan))("active")).toEqual(["b", "a", "c"]);
  });

  test("자리가 칸보다 크면 맨 뒤 — 거절하지 않는다(INV-B3: 놓을 때 검사하지 않는다)", () => {
    const features = [feature("a"), feature("b")];
    const rows = [row("a", "active", 0)];
    const plan = planMove(features, rows, move(["b"], "active", 99), NOW);
    expect(areaOf(features, apply(rows, plan))("active")).toEqual(["a", "b"]);
  });

  test("🔴 작업 대상으로 올라오면 의존에서 단계를 계산해 심는다 — 의존 없으면 전부 1단계", () => {
    const features = [feature("auth-login", ["01", "02"])];
    const plan = planMove(features, [], move(["auth-login"], "active"), NOW);
    expect(plan.setSteps).toEqual([
      { feature: "auth-login", ticket: "01-x", step: 1 },
      { feature: "auth-login", ticket: "02-x", step: 1 },
    ]);
    expect(plan.clearSteps).toEqual([]);
  });

  test("🔴 선형 의존이면 위상 순서대로 1·2·3단계가 심어진다(T02)", () => {
    const features = [
      feature("chain", ["01", { num: "02", blockedBy: ["01"] }, { num: "03", blockedBy: ["02"] }]),
    ];
    const plan = planMove(features, [], move(["chain"], "active"), NOW);
    expect(plan.setSteps).toEqual([
      { feature: "chain", ticket: "01-x", step: 1 },
      { feature: "chain", ticket: "02-x", step: 2 },
      { feature: "chain", ticket: "03-x", step: 3 },
    ]);
  });

  test("🔴 되올린 카드도 새로 계산한 값을 심는다 — 옛 숫자를 되살리지 않는다", () => {
    const features = [feature("auth-login", ["01"])];
    // 예약에 내려가 있던 카드(단계는 내려갈 때 이미 지워졌다)를 다시 올린다.
    const rows = [row("auth-login", "reserved", 0)];
    const plan = planMove(features, rows, move(["auth-login"], "active"), NOW);
    expect(plan.setSteps).toEqual([
      { feature: "auth-login", ticket: "01-x", step: 1 },
    ]);
  });

  test("🔴 되올라온 기능의 끝난 티켓(done·dropped)에는 단계 행을 만들지 않는다(D2)", () => {
    const features = [
      feature("re-raised", [
        resolved("01", "2026-08-20"),
        wontfix("02"),
        { num: "03", blockedBy: ["01"] },
      ]),
    ];
    // 예약에 내려가 있던 기능에 티켓이 생겨 다시 작업 대상으로 올라온다.
    const rows = [row("re-raised", "reserved", 0)];
    const plan = planMove(features, rows, move(["re-raised"], "active"), NOW);
    // 끝난 01·02 에는 행이 없고, 남은 03 은 완료된 선행(01)이 풀려 1단계가 된다.
    expect(plan.setSteps).toEqual([
      { feature: "re-raised", ticket: "03-x", step: 1 },
    ]);
  });

  test("🔴 신관례 전용 기능(옛 관례 티켓 0장)을 올리면 단계 행이 심어진다", () => {
    const features = [
      feature("new-only", [
        { num: "01", newConvention: true },
        { num: "02", newConvention: true, blockedBy: ["01"] },
      ]),
    ];
    const plan = planMove(features, [], move(["new-only"], "active"), NOW);
    expect(plan.setSteps).toEqual([
      { feature: "new-only", ticket: "T01", step: 1 },
      { feature: "new-only", ticket: "T02", step: 2 },
    ]);
  });

  test("🔴 두 관례가 섞인 기능은 합쳐서 단계를 심는다 — 신관례 선행 위에서도 계산한다", () => {
    const features = [
      feature("mixed", [
        "01",
        { num: "02", blockedBy: ["01"], newConvention: true },
      ]),
    ];
    const plan = planMove(features, [], move(["mixed"], "active"), NOW);
    expect(plan.setSteps).toEqual([
      { feature: "mixed", ticket: "01-x", step: 1 },
      { feature: "mixed", ticket: "T02", step: 2 },
    ]);
  });

  test("🔴 되올라온 신관례 전용 기능의 끝난 티켓에도 행을 만들지 않는다(D2)", () => {
    const features = [
      feature("new-re-raised", [
        { ...resolved("01", "2026-08-20"), newConvention: true },
        { num: "02", newConvention: true, blockedBy: ["01"] },
      ]),
    ];
    const rows = [row("new-re-raised", "reserved", 0)];
    const plan = planMove(features, rows, move(["new-re-raised"], "active"), NOW);
    // 끝난 01 은 풀려 02 가 1단계가 된다.
    expect(plan.setSteps).toEqual([
      { feature: "new-re-raised", ticket: "T02", step: 1 },
    ]);
  });

  test("작업 대상 안에서 순서만 바꾼 카드의 단계는 건드리지 않는다 — firstmate 가 매긴 값이다", () => {
    const features = [feature("a", ["01"]), feature("b", ["01"])];
    const rows = [row("a", "active", 0), row("b", "active", 1)];
    const plan = planMove(features, rows, move(["b"], "active", 0), NOW);
    expect(plan.setSteps).toEqual([]);
    expect(plan.clearSteps).toEqual([]);
  });

  test.each(["reserved", "discarded", "done"] as const)(
    "🔴 작업 대상을 떠나면(%s) 그 기능 티켓들의 단계가 지워진다",
    (area) => {
      const features = [feature("a", ["01", "02"])];
      const rows = [row("a", "active", 0)];
      const plan = planMove(features, rows, move(["a"], area), NOW);
      expect(plan.clearSteps).toEqual(["a"]);
      expect(plan.setSteps).toEqual([]);
      expect(areaOf(features, apply(rows, plan))(area)).toEqual(["a"]);
      expect(areaOf(features, apply(rows, plan))("active")).toEqual([]);
    },
  );

  test("작업 대상에 있지도 않던 카드를 내려도 지울 단계가 없다", () => {
    const features = [feature("a", ["01"])];
    const plan = planMove(features, [], move(["a"], "reserved"), NOW);
    expect(plan.clearSteps).toEqual([]);
  });

  test("🔴 남은 티켓이 있어도 완료로 간다 — 거절도 경고도 이유도 없다(캡틴 결정)", () => {
    const features = [feature("half-done", ["01", "02"])];
    const rows = [row("half-done", "active", 0)];
    const plan = planMove(features, rows, move(["half-done"], "done"), NOW);
    expect(plan.upsert).toEqual([
      { feature: "half-done", area: "done", seq: 0, closedAt: NOW },
    ]);
  });

  test("닫힌 시각은 완료 칸에 **들어가는 순간**에만 찍힌다 — 이미 있던 카드는 제 시각을 지킨다", () => {
    const features = [feature("old"), feature("new")];
    const rows = [row("old", "done", 0, "2026-08-01 09:00")];
    const plan = planMove(features, rows, move(["new"], "done", 0), NOW);
    expect(plan.upsert).toEqual([
      { feature: "new", area: "done", seq: 0, closedAt: NOW },
      { feature: "old", area: "done", seq: 1, closedAt: "2026-08-01 09:00" },
    ]);
  });

  test("완료를 떠나면 닫힌 시각이 지워진다 — 닫히지 않은 카드가 시각을 이고 있으면 거짓말이다", () => {
    const features = [feature("reopened")];
    const rows = [row("reopened", "done", 0, "2026-08-01 09:00")];
    const plan = planMove(features, rows, move(["reopened"], "active"), NOW);
    expect(plan.upsert[0]).toMatchObject({ area: "active", closedAt: null });
  });

  test("🔴 대기로 보내면 자리 행을 지운다 — 대기를 뜻하는 값을 쓰지 않는다(INV-B1)", () => {
    const features = [feature("a", ["01"])];
    const rows = [row("a", "active", 0)];
    const plan = planMove(features, rows, move(["a"], null), NOW);
    expect(plan.remove).toEqual(["a"]);
    expect(plan.upsert).toEqual([]);
    expect(plan.clearSteps).toEqual(["a"]); // 작업 대상을 떠난 것이므로 단계도 사라진다
    expect(areaOf(features, apply(rows, plan))("waiting")).toEqual(["a"]);
  });

  test("🔴 문서가 없는 슬러그로는 자리 행을 짓지 않는다 — 카드를 지어내지 않는다", () => {
    const plan = planMove([feature("real")], [], move(["ghost"], "active"), NOW);
    expect(plan).toEqual({ upsert: [], remove: [], clearSteps: [], setSteps: [] });
  });

  test("옮긴 칸 밖의 자리 행은 손대지 않는다 — 한 번의 이동이 판 전체를 다시 쓰지 않는다", () => {
    const features = [feature("a"), feature("b"), feature("c")];
    const rows = [row("a", "reserved", 5), row("b", "active", 0)];
    const plan = planMove(features, rows, move(["c"], "active", 1), NOW);
    expect(plan.upsert.map((p) => p.feature)).toEqual(["b", "c"]);
    expect(areaOf(features, apply(rows, plan))("reserved")).toEqual(["a"]);
  });

  test("문서가 지워져 화면에 없는 행은 자리 세기에서 빠진다 — 캡틴이 센 자리와 어긋나지 않게", () => {
    const features = [feature("visible"), feature("moving")];
    const rows = [row("ghost", "active", 0), row("visible", "active", 1)];
    // 캡틴 눈에는 `visible` 한 장뿐이다 — 그 앞(0)에 놓는다.
    const plan = planMove(features, rows, move(["moving"], "active", 0), NOW);
    expect(areaOf(features, apply(rows, plan))("active")).toEqual(["moving", "visible"]);
  });
});
