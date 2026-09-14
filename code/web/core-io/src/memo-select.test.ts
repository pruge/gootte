import { describe, expect, test } from "vitest";
import type { Memo } from "@gootte/contract";
import { memoCounts, memoListText, selectMemos, type MemoFilter } from "./memo-select";

/** 메모 한 장 합성 — 저장 순서(id) 와 작성 시각을 따로 고정할 수 있다. */
function memo(id: string, content: string, createdAt: string, done = false): Memo {
  return { id, content, done, createdAt, updatedAt: createdAt };
}

/** 출력에서 항목 머리(`- [ ]` / `- [x]`)만 고른다 — 들여쓰기 continuation 은 항목 수가 아니다. */
function itemHeads(text: string): string[] {
  return text.split("\n").filter((l) => l.startsWith("- ["));
}

describe("memoCounts", () => {
  test("전체·완료·미완료 — 필터와 무관하게 주입된 목록 전체를 센다", () => {
    const memos = [
      memo("1", "a", "2026-09-01T00:00:00.000Z"),
      memo("2", "b", "2026-09-02T00:00:00.000Z", true),
      memo("3", "c", "2026-09-03T00:00:00.000Z"),
    ];
    expect(memoCounts(memos)).toEqual({ total: 3, done: 1, undone: 2 });
  });

  test("빈 목록은 0", () => {
    expect(memoCounts([])).toEqual({ total: 0, done: 0, undone: 0 });
  });
});

describe("selectMemos", () => {
  const memos = [
    memo("1", "오래된 미완료", "2026-09-01T00:00:00.000Z"),
    memo("2", "중간 완료", "2026-09-02T00:00:00.000Z", true),
    memo("3", "최신 미완료", "2026-09-03T00:00:00.000Z"),
  ];

  test("all — 전체를 createdAt 내림차순(최신먼저)", () => {
    expect(selectMemos(memos, "all").map((m) => m.id)).toEqual(["3", "2", "1"]);
  });

  test("done — 완료만. 화면과 같은 규약(`done === true`)", () => {
    expect(selectMemos(memos, "done").map((m) => m.id)).toEqual(["2"]);
  });

  test("undone — 미완료만", () => {
    expect(selectMemos(memos, "undone").map((m) => m.id)).toEqual(["3", "1"]);
  });

  test("같은 시각은 저장 순서 유지(안정 정렬 — 2 차 키를 인위적으로 넣지 않는다)", () => {
    const same = [
      memo("a", "먼저 저장됨", "2026-09-05T00:00:00.000Z"),
      memo("b", "나중에 저장됨", "2026-09-05T00:00:00.000Z"),
      memo("c", "더Later — 시각은 더 새로움", "2026-09-06T00:00:00.000Z"),
    ];
    expect(selectMemos(same, "all").map((m) => m.id)).toEqual(["c", "a", "b"]);
  });

  test("원본 배열을 바꾸지 않는다(파생 읽기 — 저장이 아니라 계산)", () => {
    const before = memos.map((m) => m.id);
    selectMemos(memos, "all");
    expect(memos.map((m) => m.id)).toEqual(before);
  });

  test("filter 기본값은 all", () => {
    expect(selectMemos(memos).map((m) => m.id)).toEqual(["3", "2", "1"]);
    const filter: MemoFilter = "all";
    expect(filter).toBe("all");
  });
});

describe("memoListText — 헤더", () => {
  const memos = [
    memo("1", "미완료 하나", "2026-09-01T00:00:00.000Z"),
    memo("2", "완료 하나", "2026-09-02T00:00:00.000Z", true),
    memo("3", "미완료 둘", "2026-09-03T00:00:00.000Z"),
  ];

  test("`== <slug> · 메모 N건 (완료 A · 미완료 B) ==` — 필터 없으면 그대로", () => {
    expect(memoListText("jinwooauto", memos, "all").split("\n")[0]).toBe(
      "== jinwooauto · 메모 3건 (완료 1 · 미완료 2) ==",
    );
  });

  test("필터가 있으면 헤더 끝에 `· 필터: <값>` — 잘린 목록을 전체처럼 그리지 않는다", () => {
    expect(memoListText("p", memos, "undone").split("\n")[0]).toBe(
      "== p · 메모 3건 (완료 1 · 미완료 2) · 필터: undone ==",
    );
    expect(memoListText("p", memos, "done").split("\n")[0]).toBe(
      "== p · 메모 3건 (완료 1 · 미완료 2) · 필터: done ==",
    );
  });

  test("헤더 카운트는 **필터 이전** 값 — 필터로 항목이 줄어도 전체 건수 그대로", () => {
    const undone = memoListText("p", memos, "undone");
    expect(undone).toContain("메모 3건 (완료 1 · 미완료 2)");
    expect(itemHeads(undone)).toHaveLength(2);
  });

  test("메모가 하나도 없으면 `== <slug> · 메모 없음 ==` (exit 0 로 갈리는 그 얼굴)", () => {
    expect(memoListText("fresh", [], "all")).toBe("== fresh · 메모 없음 ==");
  });

  test("0건이면 헤더를 버리지 않고 그 한 줄만 낸다 — 목록 행도 없다", () => {
    const text = memoListText("fresh", [], "undone");
    expect(text).toBe("== fresh · 메모 없음 ==");
    expect(text.split("\n")).toHaveLength(1);
  });
});

describe("memoListText — 항목", () => {
  test("한 줄 메모: `- [ ] YYYY-MM-DD <첫 줄>` — 완료는 `- [x]`", () => {
    const memos = [
      memo("1", "미완료 생각", "2026-09-10T05:00:00.000Z"),
      memo("2", "완료 생각", "2026-09-09T05:00:00.000Z", true),
    ];
    expect(memoListText("p", memos, "all")).toBe(
      ["== p · 메모 2건 (완료 1 · 미완료 1) ==", "- [ ] 2026-09-10 미완료 생각", "- [x] 2026-09-09 완료 생각"].join(
        "\n",
      ),
    );
  });

  test("createdAt 은 앞 10 자만 — 화면 날짜 그룹(`MemoView.tsx`)과 같은 규약", () => {
    const text = memoListText("p", [memo("1", "x", "2026-09-10T23:59:59.999Z")], "all");
    expect(text).toContain("- [ ] 2026-09-10 x");
    expect(text).not.toContain("T23");
  });

  test("다중 줄 메모: 둘째 줄부터 4 칸 들여쓰기 verbatim — 재접합하면 한 항목으로 붙는다", () => {
    const content = "첫 줄\n둘째 줄은 4칸 들여쓰기로 verbatim 그대로\n셋째 줄";
    const text = memoListText("p", [memo("1", content, "2026-09-10T00:00:00.000Z")], "all");
    expect(text.split("\n")).toEqual([
      "== p · 메모 1건 (완료 0 · 미완료 1) ==",
      "- [ ] 2026-09-10 첫 줄",
      "    둘째 줄은 4칸 들여쓰기로 verbatim 그대로",
      "    셋째 줄",
    ]);
    // 하나의 항목으로 붙는다 — continuation 은 항목 머리가 아니다.
    expect(itemHeads(text)).toHaveLength(1);
  });

  test("내용 안의 글자는 요약하지 않는다(INV-4 verbatim) — 마크다운·역슬래시 그대로", () => {
    const raw = "```ts\nconst x = 1;\n```";
    const text = memoListText("p", [memo("1", raw, "2026-09-10T00:00:00.000Z")], "all");
    expect(text).toContain("    const x = 1;");
    expect(text).toContain("    ```");
  });

  test("빈 continuation 줄은 후미 공백을 남기지 않는다(들여쓰기 0 칸)", () => {
    const text = memoListText("p", [memo("1", "첫 줄\n\n둘째 문서", "2026-09-10T00:00:00.000Z")], "all");
    expect(text.split("\n")).toEqual([
      "== p · 메모 1건 (완료 0 · 미완료 1) ==",
      "- [ ] 2026-09-10 첫 줄",
      "",
      "    둘째 문서",
    ]);
  });

  test("필터와 겹쳐도 항목 형식 동일 — undone 은 `- [ ]` 만, done 은 `- [x]` 만 남는다", () => {
    const memos = [
      memo("1", "미완료", "2026-09-10T00:00:00.000Z"),
      memo("2", "완료", "2026-09-11T00:00:00.000Z", true),
    ];
    expect(memoListText("p", memos, "undone")).toBe(
      ["== p · 메모 2건 (완료 1 · 미완료 1) · 필터: undone ==", "- [ ] 2026-09-10 미완료"].join("\n"),
    );
    expect(memoListText("p", memos, "done")).toBe(
      ["== p · 메모 2건 (완료 1 · 미완료 1) · 필터: done ==", "- [x] 2026-09-11 완료"].join("\n"),
    );
  });

  test("필터 결과와 무관하게 최신순 — 오래된 완료는 Newest 미완료 뒤에 오지 않는다", () => {
    const memos = [
      memo("1", "오래된 완료", "2026-09-01T00:00:00.000Z", true),
      memo("2", "최신 미완료", "2026-09-12T00:00:00.000Z"),
      memo("3", "중간 완료", "2026-09-05T00:00:00.000Z", true),
    ];
    expect(memoListText("p", memos, "done").split("\n").slice(1)).toEqual([
      "- [x] 2026-09-05 중간 완료",
      "- [x] 2026-09-01 오래된 완료",
    ]);
  });
});
