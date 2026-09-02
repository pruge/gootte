import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { memosFile, readMemos, appendMemo, updateMemo, deleteMemo } from "./memo-store";

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "gootte-memo-"));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe("memosFile", () => {
  test("프로젝트별 JSON 파일 경로를 만든다", () => {
    expect(memosFile(dataDir, "my-project")).toBe(join(dataDir, "memos", "my-project.json"));
  });
});

describe("readMemos", () => {
  test("파일이 없으면 빈 배열", () => {
    expect(readMemos(dataDir, "project-a")).toEqual([]);
  });

  test("저장한 메모를 그대로 읽는다", () => {
    const m1 = appendMemo(dataDir, "project-a", { content: "첫 메모" }, "2026-01-01T00:00:00.000Z");
    const m2 = appendMemo(dataDir, "project-a", { content: "둘째 메모" }, "2026-01-02T00:00:00.000Z");
    const all = readMemos(dataDir, "project-a");
    expect(all).toHaveLength(2);
    expect(all[0]!.content).toBe("첫 메모");
    expect(all[1]!.content).toBe("둘째 메모");
  });

  test("망가진 JSON 은 던진다 — 빈 배열로 위장하지 않음", () => {
    mkdirSync(join(dataDir, "memos"), { recursive: true });
    writeFileSync(memosFile(dataDir, "project-a"), "{ not json");
    expect(() => readMemos(dataDir, "project-a")).toThrow();
  });

  test("다른 프로젝트 파일은 서로 섞이지 않는다", () => {
    appendMemo(dataDir, "project-a", { content: "A" }, "2026-01-01T00:00:00.000Z");
    appendMemo(dataDir, "project-b", { content: "B" }, "2026-01-01T00:00:00.000Z");
    expect(readMemos(dataDir, "project-a")).toHaveLength(1);
    expect(readMemos(dataDir, "project-b")).toHaveLength(1);
    expect(readMemos(dataDir, "project-a")[0]!.content).toBe("A");
    expect(readMemos(dataDir, "project-b")[0]!.content).toBe("B");
  });
});

describe("appendMemo", () => {
  test("메모를 추가하고 id·시각이 채워진다", () => {
    const memo = appendMemo(dataDir, "project-a", { content: "새 메모" }, "2026-06-01T12:00:00.000Z");
    expect(memo.content).toBe("새 메모");
    expect(memo.createdAt).toBe("2026-06-01T12:00:00.000Z");
    expect(memo.updatedAt).toBe("2026-06-01T12:00:00.000Z");
    expect(memo.id).toBeTruthy();
    expect(memo.id).toMatch(/^\d+-\d+$/);
  });

  test("목록 뒤에 붙는다 — 작성 순서 보존", () => {
    const m1 = appendMemo(dataDir, "project-a", { content: "첫" }, "2026-01-01T00:00:00.000Z");
    const m2 = appendMemo(dataDir, "project-a", { content: "둘" }, "2026-01-02T00:00:00.000Z");
    const m3 = appendMemo(dataDir, "project-a", { content: "셋" }, "2026-01-03T00:00:00.000Z");
    const all = readMemos(dataDir, "project-a");
    expect(all.map((m) => m.content)).toEqual(["첫", "둘", "셋"]);
    expect(all.map((m) => m.id)).toEqual([m1.id, m2.id, m3.id]);
  });
});

describe("updateMemo", () => {
  test("내용만 바꾸고 수정 시각을 갱신한다", () => {
    const m = appendMemo(dataDir, "project-a", { content: "원본" }, "2026-01-01T00:00:00.000Z");
    const updated = updateMemo(dataDir, "project-a", m.id, { content: "수정됨" }, "2026-06-01T00:00:00.000Z");
    expect(updated).not.toBeNull();
    expect(updated!.content).toBe("수정됨");
    expect(updated!.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(updated!.updatedAt).toBe("2026-06-01T00:00:00.000Z");
  });

  test("없는 id 면 null", () => {
    const result = updateMemo(dataDir, "project-a", "nonexistent", { content: "x" }, "2026-01-01T00:00:00.000Z");
    expect(result).toBeNull();
  });

  test("저장소에 반영된다 — 다시 읽으면 수정된 값", () => {
    const m = appendMemo(dataDir, "project-a", { content: "원본" }, "2026-01-01T00:00:00.000Z");
    updateMemo(dataDir, "project-a", m.id, { content: "변경" }, "2026-06-01T00:00:00.000Z");
    const all = readMemos(dataDir, "project-a");
    expect(all).toHaveLength(1);
    expect(all[0]!.content).toBe("변경");
  });

  test("done 을 주면 완료 표시가 저장된다 — 내용은 그대로", () => {
    const m = appendMemo(dataDir, "project-a", { content: "원본" }, "2026-01-01T00:00:00.000Z");
    const updated = updateMemo(
      dataDir,
      "project-a",
      m.id,
      { content: "원본", done: true },
      "2026-06-01T00:00:00.000Z",
    );
    expect(updated!.done).toBe(true);
    expect(updated!.content).toBe("원본");
    expect(readMemos(dataDir, "project-a")[0]!.done).toBe(true);
  });

  test("done 을 안 주면 완료 표시를 건드리지 않는다(토글에 content 만 쓰는 안전선)", () => {
    const m = appendMemo(dataDir, "project-a", { content: "원본", done: true }, "2026-01-01T00:00:00.000Z");
    updateMemo(dataDir, "project-a", m.id, { content: "고침" }, "2026-06-01T00:00:00.000Z");
    expect(readMemos(dataDir, "project-a")[0]!.done).toBe(true);
    expect(readMemos(dataDir, "project-a")[0]!.content).toBe("고침");
  });
});

describe("deleteMemo", () => {
  test("메모를 지우고 true", () => {
    const m = appendMemo(dataDir, "project-a", { content: "지울 메모" }, "2026-01-01T00:00:00.000Z");
    expect(deleteMemo(dataDir, "project-a", m.id)).toBe(true);
    expect(readMemos(dataDir, "project-a")).toEqual([]);
  });

  test("없는 id 면 false", () => {
    expect(deleteMemo(dataDir, "project-a", "nonexistent")).toBe(false);
  });

  test("여러 메모 중 하나만 지운다", () => {
    const m1 = appendMemo(dataDir, "project-a", { content: "첫" }, "2026-01-01T00:00:00.000Z");
    const m2 = appendMemo(dataDir, "project-a", { content: "둘" }, "2026-01-02T00:00:00.000Z");
    const m3 = appendMemo(dataDir, "project-a", { content: "셋" }, "2026-01-03T00:00:00.000Z");
    deleteMemo(dataDir, "project-a", m2.id);
    const all = readMemos(dataDir, "project-a");
    expect(all.map((m) => m.content)).toEqual(["첫", "셋"]);
  });
});