import { describe, expect, it } from "vitest";
import { appendRank, firstRank, insertBetween, renumberSparse } from "./rank";

describe("rank — 성긴 순위(spec §모델)", () => {
  it("firstRank — 트랙에 첫 기능", () => {
    expect(firstRank()).toBe(10);
  });

  it("appendRank — 끝에 이어 붙인다", () => {
    expect(appendRank([])).toBe(10);
    expect(appendRank([10, 20, 30])).toBe(40);
  });

  it("insertBetween — 이웃 사이에 끼울 때 그 값만 계산된다, 다른 줄은 안 바뀐다", () => {
    expect(insertBetween(10, 20)).toBe(15);
    expect(insertBetween(10, 15)).toBe(12.5);
  });

  it("insertBetween — 틈이 다 찼으면(정밀도 밑으로 좁아지면) null", () => {
    expect(insertBetween(10, 10.0000001)).toBeNull();
  });

  it("renumberSparse — 그 트랙만 10·20·30 으로 다시 매긴다", () => {
    expect(renumberSparse(3)).toEqual([10, 20, 30]);
    expect(renumberSparse(0)).toEqual([]);
  });
});
