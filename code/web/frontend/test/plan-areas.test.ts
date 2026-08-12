import { describe, it, expect } from "vitest";
import type { Feature, PlanBoardResponse, PlanCard } from "@gootte/contract";
import {
  AREA_DROP_ID,
  TAB_DROP_ID,
  applyMoveToBoard,
  changesBoard,
  dropTargetArea,
  insertIndex,
  storedArea,
} from "../src/components/plan/areas";
import { featureDocPath } from "../src/components/plan/planDoc";

describe("storedArea — 화면의 칸 이름 → 저장되는 자리", () => {
  it("🔴 대기는 저장되는 값이 아니라 null 이다 — 자리 행이 없다는 사실 그 자체다(INV-B1)", () => {
    expect(storedArea("waiting")).toBeNull();
  });

  it("나머지 넷은 이름 그대로 간다 — 화면이 자기 사전을 따로 두지 않는다", () => {
    expect(["active", "reserved", "discarded", "done"].map((a) => storedArea(a as never))).toEqual([
      "active",
      "reserved",
      "discarded",
      "done",
    ]);
  });
});

describe("dropTargetArea — 어디에 놓았나", () => {
  it("칸 위에 놓으면 그 칸", () => {
    expect(dropTargetArea(AREA_DROP_ID("reserved"), undefined)).toBe("reserved");
  });

  it("탭 머리에 놓으면 그 칸 — 접힌 칸으로 가는 유일한 끌기 경로다", () => {
    expect(dropTargetArea(TAB_DROP_ID("done"), undefined)).toBe("done");
  });

  it("카드 위에 놓으면 그 카드가 있는 칸", () => {
    expect(dropTargetArea("auth-login", "active")).toBe("active");
  });

  it("알아볼 수 없는 자리면 아무 일도 없다", () => {
    expect(dropTargetArea("auth-login", undefined)).toBeNull();
  });
});

describe("insertIndex — 끼워 넣을 자리(옮길 카드를 뺀 나머지 기준)", () => {
  const dest = ["a", "b", "c"];

  it("칸이나 탭 위에 놓으면 맨 뒤", () => {
    expect(insertIndex(dest, ["z"], null)).toBe(3);
  });

  it("다른 칸에서 온 카드는 놓인 카드 앞에 선다", () => {
    expect(insertIndex(dest, ["z"], "b")).toBe(1);
  });

  it("위로 끌어 올리면 놓인 카드 앞 — 맨 앞자리에 갈 수 있다", () => {
    expect(insertIndex(dest, ["c"], "a")).toBe(0);
  });

  it("아래로 끌어 내리면 놓인 카드 뒤 — 맨 끝자리에 갈 수 있다", () => {
    expect(insertIndex(dest, ["a"], "c")).toBe(2);
  });

  it("여러 장도 한 덩어리로 들어간다", () => {
    expect(insertIndex(dest, ["a", "b"], "c")).toBe(1);
  });

  it("모르는 카드 위에 놓으면 맨 뒤 — 거절하지 않는다(INV-B3)", () => {
    expect(insertIndex(dest, ["z"], "없는것")).toBe(3);
  });
});

describe("changesBoard — 제자리에 도로 놓은 것은 쓰지 않는다", () => {
  const dest = ["a", "b", "c"];

  it("칸이 바뀌면 언제나 쓴다", () => {
    expect(changesBoard("waiting", "active", [], ["a"], 0)).toBe(true);
  });

  it("같은 칸 같은 자리면 쓰지 않는다 — 판이 이유 없이 깜빡이지 않게", () => {
    expect(changesBoard("active", "active", dest, ["b"], 1)).toBe(false);
  });

  it("같은 칸이라도 자리가 달라지면 쓴다", () => {
    expect(changesBoard("active", "active", dest, ["b"], 0)).toBe(true);
  });
});

/**
 * 놓는 순간의 한 프레임 — **연출이지 판정이 아니다.** 서버의 답이 오면 통째로 덮인다.
 * 그래서 여기서 재는 것은 하나뿐이다: **새로 지어내는 값이 없는가.**
 */
describe("applyMoveToBoard — 놓은 자리로 카드를 옮겨 놓은 한 프레임", () => {
  const card = (slug: string, seq: number | null = null, closedAt: string | null = null): PlanCard =>
    ({ feature: { slug } as Feature, seq, closedAt });

  const board = (over: Partial<PlanBoardResponse> = {}): PlanBoardResponse => ({
    project: "alpha",
    waiting: [],
    active: [],
    reserved: [],
    discarded: [],
    done: [],
    ...over,
  });

  const slugs = (cards: readonly PlanCard[]) => cards.map((c) => c.feature.slug);

  it("옮긴 칸에서 빠지고 놓은 칸의 그 자리에 들어간다", () => {
    const next = applyMoveToBoard(
      board({ waiting: [card("a")], active: [card("x", 0), card("y", 1)] }),
      { features: ["a"], area: "active", index: 1 },
    );
    expect(slugs(next.active)).toEqual(["x", "a", "y"]);
    expect(next.waiting).toEqual([]);
  });

  it("여러 장도 집은 순서 그대로 한 덩어리로 들어간다", () => {
    const next = applyMoveToBoard(board({ waiting: [card("a"), card("b"), card("c")] }), {
      features: ["c", "a"],
      area: "active",
      index: 0,
    });
    expect(slugs(next.active)).toEqual(["c", "a"]);
    expect(slugs(next.waiting)).toEqual(["b"]);
  });

  it("🔴 대기(null)로 보내면 대기 칸으로 간다 — 자리 값을 지어내지 않는다", () => {
    const next = applyMoveToBoard(board({ active: [card("a", 0)] }), {
      features: ["a"],
      area: null,
      index: 0,
    });
    expect(slugs(next.waiting)).toEqual(["a"]);
    expect(next.active).toEqual([]);
  });

  it("🔴 카드 객체를 그대로 옮겨 담는다 — seq·closedAt 을 새로 계산하지 않는다", () => {
    const shipped = card("shipped", 3, "2026-08-01 09:00");
    const next = applyMoveToBoard(board({ done: [shipped] }), {
      features: ["shipped"],
      area: "active",
      index: 0,
    });
    // 이 값들이 맞는지는 서버가 정한다 — 이 프레임은 판정하지 않으므로 손대지 않는다.
    expect(next.active[0]).toBe(shipped);
  });

  it("판에 없는 기능이면 판을 그대로 돌려준다 — 없는 카드를 만들지 않는다", () => {
    const before = board({ waiting: [card("a")] });
    expect(applyMoveToBoard(before, { features: ["ghost"], area: "active", index: 0 })).toBe(before);
  });

  it("건드리지 않은 칸은 그대로다", () => {
    const next = applyMoveToBoard(
      board({ waiting: [card("a")], reserved: [card("r")], done: [card("d")] }),
      { features: ["a"], area: "active", index: 0 },
    );
    expect(slugs(next.reserved)).toEqual(["r"]);
    expect(slugs(next.done)).toEqual(["d"]);
  });
});

describe("featureDocPath — 문서 아이콘이 열 문서", () => {
  const feature = (docs: Feature["docs"]): Feature => ({
    slug: "f",
    title: "f",
    status: "pending",
    sourceStatus: null,
    statusKnown: true,
    tickets: [],
    docs,
  });

  it("spec.md 가 있으면 그것 — 기능이 무엇인가를 말하는 문서다", () => {
    expect(
      featureDocPath(
        feature([
          { kind: "file", name: "architecture.md", path: "architecture.md" },
          { kind: "file", name: "spec.md", path: "spec.md" },
        ]),
      ),
    ).toBe("spec.md");
  });

  it("없으면 폴더에 실제로 있는 첫 파일", () => {
    expect(
      featureDocPath(feature([{ kind: "file", name: "notes.md", path: "notes.md" }])),
    ).toBe("notes.md");
  });

  it("하위 폴더 안까지 뒤진다", () => {
    expect(
      featureDocPath(
        feature([
          {
            kind: "dir",
            name: "adr",
            path: "adr",
            children: [{ kind: "file", name: "0001-x.md", path: "adr/0001-x.md" }],
          },
        ]),
      ),
    ).toBe("adr/0001-x.md");
  });

  it("🔴 파일이 하나도 없으면 null — 없는 문서를 지어내지 않는다", () => {
    expect(featureDocPath(feature([]))).toBeNull();
  });
});
