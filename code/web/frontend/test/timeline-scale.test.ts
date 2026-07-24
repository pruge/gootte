import { describe, it, expect } from "vitest";
import { dayNumber, dateToT, dateToX, barSpanT, axisTicks } from "../src/lib/timeline";

describe("timeline scale — dateToT (날짜→정규화 위치)", () => {
  const from = "2026-07-05";
  const to = "2026-07-25"; // 20일 구간

  it("시작=0, 끝=1", () => {
    expect(dateToT(from, from, to)).toBe(0);
    expect(dateToT(to, from, to)).toBe(1);
  });

  it("중간 날짜 = 선형 보간", () => {
    expect(dateToT("2026-07-15", from, to)).toBeCloseTo(0.5, 6); // 10/20
    expect(dateToT("2026-07-10", from, to)).toBeCloseTo(0.25, 6); // 5/20
  });

  it("구간 밖 = clamp [0,1]", () => {
    expect(dateToT("2026-07-01", from, to)).toBe(0);
    expect(dateToT("2026-08-01", from, to)).toBe(1);
  });

  it("단일 날짜(from==to) = 0 (0 나누기 방어)", () => {
    expect(dateToT("2026-07-05", from, from)).toBe(0);
  });

  it("파싱 실패 = 0", () => {
    expect(dateToT("nope", from, to)).toBe(0);
    expect(Number.isNaN(dayNumber("nope"))).toBe(true);
  });

  it("dateToX = dateToT × width (픽셀)", () => {
    expect(dateToX("2026-07-15", from, to, 1000)).toBeCloseTo(500, 3);
  });
});

describe("timeline scale — barSpanT (바 위치·폭)", () => {
  const from = "2026-07-05";
  const to = "2026-07-25";

  it("바 = {x=시작t, w=끝t−시작t}", () => {
    const { x, w } = barSpanT("2026-07-10", "2026-07-15", from, to);
    expect(x).toBeCloseTo(0.25, 6);
    expect(w).toBeCloseTo(0.25, 6); // (10→15)/20
  });

  it("minW = 최소 폭 보장(0폭 바)", () => {
    const { w } = barSpanT("2026-07-10", "2026-07-10", from, to, 0.05);
    expect(w).toBe(0.05);
  });
});

describe("timeline scale — axisTicks (날짜축 눈금)", () => {
  it("from~to 등분, MM-DD 라벨, t 오름차순, 끝 포함", () => {
    const ticks = axisTicks("2026-07-05", "2026-07-25", 5);
    expect(ticks[0]).toMatchObject({ date: "2026-07-05", label: "07-05", t: 0 });
    expect(ticks[ticks.length - 1]).toMatchObject({ date: "2026-07-25", t: 1 });
    // 단조 증가
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]!.t).toBeGreaterThan(ticks[i - 1]!.t);
  });

  it("단일 날짜 = 눈금 1개", () => {
    const ticks = axisTicks("2026-07-05", "2026-07-05");
    expect(ticks).toHaveLength(1);
    expect(ticks[0]!.label).toBe("07-05");
  });
});
