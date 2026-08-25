import { describe, expect, it } from "vitest";
import { UNRANKED_STEP, type StepRow } from "./move";
import { computeNext } from "./next";
import { computeDisplaySteps } from "./step";
import { feature, resolved, row, wontfix } from "./fixtures";

const s = (feat: string, num: string, step: number): StepRow => ({
  feature: feat,
  ticket: `${num}-x`,
  step,
});

describe("computeNext — 작업 대상의 표시 1단계만(plan-board/05, spec §next)", () => {
  it("1단계 티켓만 내보낸다", () => {
    const features = [feature("a", ["01"]), feature("b", ["02"])];
    const placements = [row("a", "active", 0), row("b", "active", 1)];
    const steps = [s("a", "01", 1), s("b", "02", 2)];
    expect(computeNext(features, placements, steps)).toEqual([
      { feature: "a", ticket: "01-x", title: "티켓 01", needsCaptainEye: false },
    ]);
  });

  it("빈 단계가 당겨지면 그 뒤 티켓이 1단계가 되어 나온다", () => {
    const features = [feature("a", [resolved("01", "2026-08-01")]), feature("b", ["02"])];
    const placements = [row("a", "active", 0), row("b", "active", 1)];
    const steps = [s("a", "01", 1), s("b", "02", 2)];
    expect(computeNext(features, placements, steps)).toEqual([
      { feature: "b", ticket: "02-x", title: "티켓 02", needsCaptainEye: false },
    ]);
  });

  it("작업 대상 밖 기능은 1단계여도 나오지 않는다", () => {
    const features = [feature("a", ["01"])];
    const placements = [row("a", "reserved", 0)];
    const steps = [s("a", "01", 1)];
    expect(computeNext(features, placements, steps)).toEqual([]);
  });

  it("🔴 신관례 전용 기능의 티켓도 '다음' 이 된다 — 옛 관례만 보던 시절엔 못 찾았다", () => {
    const features = [
      feature("new-only", [
        { num: "01", newConvention: true },
        { num: "02", newConvention: true },
      ]),
    ];
    const placements = [row("new-only", "active", 0)];
    const steps: StepRow[] = [
      { feature: "new-only", ticket: "T01", step: 1 },
      { feature: "new-only", ticket: "T02", step: 2 },
    ];
    expect(computeNext(features, placements, steps)).toEqual([
      { feature: "new-only", ticket: "T01", title: "티켓 01", needsCaptainEye: false },
    ]);
  });

  it("예약·폐기·완료 칸의 기능은 나오지 않는다", () => {
    const features = [feature("r", ["01"]), feature("d", ["02"]), feature("done", ["03"])];
    const placements = [row("r", "reserved", 0), row("d", "discarded", 1), row("done", "done", 2)];
    const steps = [s("r", "01", 1), s("d", "02", 1), s("done", "03", 1)];
    expect(computeNext(features, placements, steps)).toEqual([]);
  });

  it("🔴 이미 완료된 티켓은 1단계로 남아 있어도 내보내지 않는다", () => {
    const features = [feature("a", [resolved("01", "2026-08-01"), "02"])];
    const placements = [row("a", "active", 0)];
    // 01·02 가 같은 1단계 — 01 은 끝났으니 안 나오고, 02 만 나온다.
    const steps = [s("a", "01", 1), s("a", "02", 1)];
    expect(computeNext(features, placements, steps)).toEqual([
      { feature: "a", ticket: "02-x", title: "티켓 02", needsCaptainEye: false },
    ]);
  });

  it("폐기 티켓도 1단계로 남아 있으면 내보내지 않는다", () => {
    const features = [feature("a", [wontfix("01")])];
    const placements = [row("a", "active", 0)];
    const steps = [s("a", "01", 1)];
    expect(computeNext(features, placements, steps)).toEqual([]);
  });

  it("🔴 9999 뿐인 기능은 나오지 않는다 — 1단계가 아니다", () => {
    const features = [feature("a", ["01"])];
    const placements = [row("a", "active", 0)];
    const steps = [s("a", "01", UNRANKED_STEP)];
    expect(computeNext(features, placements, steps)).toEqual([]);
  });

  it("정렬은 카드 순서(seq) 다음 티켓 slug — 트랙 묶음 없다", () => {
    const features = [feature("b", ["01"]), feature("a", ["01"])];
    const placements = [row("b", "active", 0), row("a", "active", 1)];
    const steps = [s("b", "01", 1), s("a", "01", 1)];
    expect(computeNext(features, placements, steps).map((t) => t.feature)).toEqual(["b", "a"]);
  });

  it("작업 대상이 비어 있으면 빈 목록", () => {
    expect(computeNext([], [], [])).toEqual([]);
  });

  it("🔴 캡틴 눈 여부는 이미 계산된 값을 그대로 싣는다 — 다시 세지 않는다(INV-E1)", () => {
    const features = [feature("a", [{ num: "01", needsCaptainEye: true }])];
    const placements = [row("a", "active", 0)];
    const steps = [s("a", "01", 1)];
    expect(computeNext(features, placements, steps)).toEqual([
      { feature: "a", ticket: "01-x", title: "티켓 01", needsCaptainEye: true },
    ]);
  });

  it("🔴 화면과 명령이 같은 함수를 쓴다 — 화면이 표시 1단계로 그릴 티켓 = next 가 말하는 티켓", () => {
    const features = [
      feature("a", [resolved("01", "2026-08-01"), "02"]),
      feature("b", ["03"]),
      feature("c", ["04"]),
    ];
    const placements = [row("a", "active", 0), row("b", "active", 1), row("c", "active", 2)];
    // a-01 은 끝났으니 안 비고(02 도 같은 1단계라 안 비었다), b 는 2단계 — b 만 당겨져 1단계가 된다.
    const steps = [s("a", "01", 1), s("a", "02", 1), s("b", "03", 2), s("c", "04", 3)];

    const display = computeDisplaySteps(features, placements, steps);
    // 화면이 그리는 "표시 1단계" 집합 — 완료·폐기까지 포함해 그 번호에 걸린 전부.
    const shownAsStepOne = Object.entries(display).flatMap(([feat, tickets]) =>
      Object.entries(tickets)
        .filter(([, step]) => step === 1)
        .map(([ticket]) => `${feat}/${ticket}`),
    );
    const nextSet = computeNext(features, placements, steps).map((t) => `${t.feature}/${t.ticket}`);

    // next 는 이미 끝난 a-01 을 뺀다 — 그래도 "표시 1단계"라는 같은 판정에서 갈라져 나온 부분집합이다.
    expect(shownAsStepOne).toEqual(["a/01-x", "a/02-x"]);
    expect(nextSet).toEqual(["a/02-x"]);
    expect(nextSet.every((k) => shownAsStepOne.includes(k))).toBe(true);
  });
});
