import { describe, expect, test } from "vitest";
import type { Feature } from "@gootte/contract";
import { splitIntoAreas } from "./board";
import { feature, resolved, row } from "./fixtures";

const slugs = (cards: { feature: Feature }[]): string[] => cards.map((c) => c.feature.slug);

describe("splitIntoAreas — 자리 판정(spec §판정 자리는 하나뿐)", () => {
  test("🔴 자리 행이 없는 기능은 대기 칸에 간다 — 등록이라는 행위가 없다(INV-B1)", () => {
    const areas = splitIntoAreas([feature("auth-login"), feature("plan-board")], []);
    expect(slugs(areas.waiting)).toEqual(["auth-login", "plan-board"]);
    expect(areas.active).toEqual([]);
    expect(areas.reserved).toEqual([]);
    expect(areas.discarded).toEqual([]);
    expect(areas.done).toEqual([]);
  });

  test("자리 행의 area 값이 그 카드가 갈 칸을 정한다", () => {
    const features = [feature("a"), feature("b"), feature("c"), feature("d"), feature("e")];
    const areas = splitIntoAreas(features, [
      row("a", "active"),
      row("b", "reserved"),
      row("c", "discarded"),
      row("d", "done"),
    ]);
    expect(slugs(areas.active)).toEqual(["a"]);
    expect(slugs(areas.reserved)).toEqual(["b"]);
    expect(slugs(areas.discarded)).toEqual(["c"]);
    expect(slugs(areas.done)).toEqual(["d"]);
    // 행이 없는 e 만 대기 — 대기는 나머지 전부이지 어딘가에 적힌 값이 아니다.
    expect(slugs(areas.waiting)).toEqual(["e"]);
  });

  test("작업 대상은 캡틴이 정한 seq 순 — 폴더명순이 아니다", () => {
    const areas = splitIntoAreas([feature("zulu"), feature("alpha")], [
      row("zulu", "active", 0),
      row("alpha", "active", 1),
    ]);
    expect(slugs(areas.active)).toEqual(["zulu", "alpha"]);
  });

  test("대기 칸은 폴더명순 — 입력 순서에 흔들리지 않는다", () => {
    const areas = splitIntoAreas([feature("zulu"), feature("alpha"), feature("mike")], []);
    expect(slugs(areas.waiting)).toEqual(["alpha", "mike", "zulu"]);
  });

  test("같은 seq 면 폴더명이 가른다 — 순서가 널뛰지 않는다", () => {
    const areas = splitIntoAreas([feature("b"), feature("a")], [
      row("a", "active", 3),
      row("b", "active", 3),
    ]);
    expect(slugs(areas.active)).toEqual(["a", "b"]);
  });

  test("🔴 문서가 없으면 카드도 없다 — 자리 행만 남은 기능은 어느 칸에도 나타나지 않는다", () => {
    const areas = splitIntoAreas([feature("alive")], [
      row("alive", "active"),
      row("deleted-feature", "active"),
    ]);
    expect(slugs(areas.active)).toEqual(["alive"]);
    expect(slugs(areas.waiting)).toEqual([]);
  });

  test("카드는 seq·closedAt 만 자리 행에서 받고, 제목·티켓은 문서에서 온다(INV-5)", () => {
    const areas = splitIntoAreas(
      [feature("shipped", ["01", "02"])],
      [row("shipped", "done", 2, "2026-08-12T09:30:00+09:00")],
    );
    expect(areas.done[0]).toMatchObject({ seq: 2, closedAt: "2026-08-12T09:30:00+09:00" });
    expect(areas.done[0]?.feature.title).toBe("shipped — 제목");
    expect(areas.done[0]?.feature.tickets.map((t) => t.num)).toEqual(["01", "02"]);
  });

  test("대기 카드는 저장된 것이 하나도 없다 — seq·closedAt 둘 다 null", () => {
    const areas = splitIntoAreas([feature("fresh")], []);
    expect(areas.waiting[0]).toMatchObject({ seq: null, closedAt: null });
  });

  test("기능도 자리 행도 없으면 다섯 칸이 전부 빈 채로 그려진다", () => {
    expect(splitIntoAreas([], [])).toEqual({
      waiting: [],
      active: [],
      reserved: [],
      discarded: [],
      done: [],
    });
  });

  test("🔴 완료 칸은 최근 완료가 위 — seq 가 아니라 완료 시각(closedAt) 내림차순", () => {
    const areas = splitIntoAreas(
      [feature("old"), feature("new"), feature("middle")],
      [
        row("old", "done", 0, "2026-08-01 09:00"),
        row("new", "done", 1, "2026-09-01 09:00"),
        row("middle", "done", 2, "2026-08-15 09:00"),
      ],
    );
    // seq 는 0,1,2(오래된 완료가 위) 였지만, 화면은 완료 시각 최근순으로 보여준다.
    expect(slugs(areas.done)).toEqual(["new", "middle", "old"]);
  });

  test("완료 시각이 같으면 폴더명이 가른다 — 순서가 널뛰지 않는다", () => {
    const areas = splitIntoAreas(
      [feature("b"), feature("a")],
      [
        row("a", "done", 0, "2026-09-01 09:00"),
        row("b", "done", 1, "2026-09-01 09:00"),
      ],
    );
    expect(slugs(areas.done)).toEqual(["a", "b"]);
  });

  test("closedAt 이 없는 카드는 문서의 완료일(documentCompletedOn)로 정렬한다", () => {
    // 저절로 닫힌 카드는 closedAt 이 없다 — 완료일은 문서의 resolved 가 소유한다.
    const areas = splitIntoAreas(
      [
        feature("shipped-late", [resolved("01", "2026-09-01")]),
        feature("shipped-early", [resolved("01", "2026-07-01")]),
      ],
      [
        row("shipped-late", "done", 0),
        row("shipped-early", "done", 1),
      ],
    );
    expect(slugs(areas.done)).toEqual(["shipped-late", "shipped-early"]);
  });

  test("완료 시각이 없는 카드는 맨 아래 — 폴더명순(순서가 널뛰지 않게)", () => {
    const areas = splitIntoAreas(
      [feature("zzz"), feature("aaa")],
      [
        row("zzz", "done", 0),
        row("aaa", "done", 1),
      ],
    );
    // 둘 다 완료 시각이 없음 — 모두 아래로 가되 폴더명순
    expect(slugs(areas.done)).toEqual(["aaa", "zzz"]);
  });
});
