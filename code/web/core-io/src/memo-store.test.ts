import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  appendMemo,
  centralMemosFile,
  deleteMemo,
  memosFile,
  readMemos,
  removeMemoFile,
  updateMemo,
  writeMemoFile,
} from "./memo-store";

/**
 * 메모 저장소 좌표 — **`<메인 프로젝트>/.gootte/memo.json` 하나뿐**(memos-live-with-the-project/T02).
 *
 * 🔴 여기서는 **central 을 읽지 않는다**는 사실을 좌표 수준에서 고정한다: `readMemos` 는 인자로
 * 프로젝트 경로만 받는다 — `dataDir` 를 받는 면이 살아있으면 누군가는 언젠가 central 을 읽는다
 * (grill Locked 5: 폴백은 이중 원장이고, 미이관 프로젝트를 이관된 척 그린다).
 * `centralMemosFile` 은 **이관 원본 좌표**로만 존재한다(`memo migrate`) — 그 사실을 테스트도 지킨다.
 * 전부 임시 디렉토리 픽스처 — 캡틴의 `~/.gootte` 를 읽지 않는다.
 */

let proj: string;

beforeEach(() => {
  proj = mkdtempSync(join(tmpdir(), "gootte-memo-proj-"));
});

afterEach(() => {
  rmSync(proj, { recursive: true, force: true });
});

describe("memosFile — 프로젝트 안 좌표 하나", () => {
  test("좌표는 `<프로젝트>/.gootte/memo.json` — 시간 기록과 같은 네임스페이스", () => {
    expect(memosFile(proj)).toBe(join(proj, ".gootte", "memo.json"));
  });

  test("🔴 central 좌표는 **다른 이름**으로만 살아있다 — `memosFile` 은 더 이상 두 인자를 받지 않는다", () => {
    // 서명 자체가 폴백 금지의 증거다: memosFile(dataDir, slug) 는 컴파일되지 않는다.
    expect(centralMemosFile(join(proj, "central"), "jinwooauto")).toBe(
      join(proj, "central", "memos", "jinwooauto.json"),
    );
    // central 과 프로젝트 좌표는 **다른 파일**이다 — 같은 길을 돌려 이중 원장이 보이게 하면 안 된다.
    expect(centralMemosFile(proj, "jinwooauto")).not.toBe(memosFile(proj));
  });
});

describe("writeMemoFile · removeMemoFile — 쓰기·지우기 규율", () => {
  test("없는 `.gootte/` 도 만들어 쓰고, 내용은 `Memo[]` 배열 하나(래퍼 객체 없음)", () => {
    writeMemoFile(memosFile(proj), [
      { id: "1-1", content: "첫 메모", done: false, createdAt: "2026-09-01", updatedAt: "2026-09-01" },
    ]);
    const raw = JSON.parse(readFileSync(memosFile(proj), "utf8"));
    expect(Array.isArray(raw)).toBe(true);
    expect(raw).toEqual([
      { id: "1-1", content: "첫 메모", done: false, createdAt: "2026-09-01", updatedAt: "2026-09-01" },
    ]);
  });

  test("다중 줄 content 는 원문 그대로 돌아온다(INV-4 — 요약하지 않는다)", () => {
    const memo = { id: "1-1", content: "첫 줄\n  들여쓴 둘째 줄\n", done: true, createdAt: "2026-09-01", updatedAt: "2026-09-01" };
    const file = memosFile(proj);
    writeMemoFile(file, [memo]);
    // 재접합해도 같은 값 — JSON 안의 개행이 살아있고, 후미 공백도 지우지 않는다.
    expect(JSON.parse(readFileSync(file, "utf8"))[0]!.content).toBe("첫 줄\n  들여쓴 둘째 줄\n");
  });

  test("지운 파일은 임시 파일로 남지 않는다 — rename 까지 끝난 것만 보인다", () => {
    const file = memosFile(proj);
    writeMemoFile(file, []);
    removeMemoFile(file);
    expect(existsSync(file)).toBe(false);
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });

  test("없는 파일을 지워도 조용하다(멱등) — central 을 두 번 purge 해도 안 터진다", () => {
    expect(() => removeMemoFile(memosFile(proj))).not.toThrow();
  });
});

describe("readMemos", () => {
  test("파일이 없으면 빈 배열", () => {
    expect(readMemos(proj)).toEqual([]);
  });

  test("🔴 빈 목록을 읽는 것이 **아무것도 만들지 않는다**(Locked 3 — 읽기 전용 실행이 사본을 더럽히면 안 된다)", () => {
    expect(existsSync(join(proj, ".gootte"))).toBe(false);
    readMemos(proj);
    expect(existsSync(join(proj, ".gootte"))).toBe(false);
  });

  test("저장한 메모를 그대로 읽는다", () => {
    const m1 = appendMemo(proj, { content: "첫 메모" }, "2026-01-01T00:00:00.000Z");
    const m2 = appendMemo(proj, { content: "둘째 메모" }, "2026-01-02T00:00:00.000Z");
    const all = readMemos(proj);
    expect(all).toHaveLength(2);
    expect(all[0]!.content).toBe("첫 메모");
    expect(all[1]!.content).toBe("둘째 메모");
    expect(m1.id).not.toBe(m2.id);
  });

  test("망가진 JSON 은 던진다 — 빈 배열로 위장하지 않음", () => {
    mkdirSync(join(proj, ".gootte"), { recursive: true });
    writeFileSync(memosFile(proj), "{ not json");
    expect(() => readMemos(proj)).toThrow();
  });

  test("🔴 central 에 같은 slug 의 데이터가 있어도 **읽지 않는다**(폴백 없음 — AC3 의 얼굴)", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "gootte-memo-central-"));
    try {
      // central 에만 2건이 있는 미이관 프로젝트가 올바른 상황의 전부다.
      writeMemoFile(centralMemosFile(dataDir, "jinwooauto"), [
        { id: "1-1", content: "중앙에만 있는 생각", done: false, createdAt: "2026-09-01", updatedAt: "2026-09-01" },
      ]);
      // 읽기는 프로젝트 경로를 받는다 — central 디렉토리를 넘길 인자 자리가 없다.
      expect(readMemos(proj)).toEqual([]);
      // 그리고 그 central 파일은 읽기 이후 그대로다(읽기가 원장을 고치지 않는다).
      expect(readMemos(proj)).toEqual([]);
      expect(JSON.parse(readFileSync(centralMemosFile(dataDir, "jinwooauto"), "utf8"))).toHaveLength(1);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("다른 프로젝트는 서로 섞이지 않는다", () => {
    const other = mkdtempSync(join(tmpdir(), "gootte-memo-other-"));
    try {
      appendMemo(proj, { content: "A" }, "2026-01-01T00:00:00.000Z");
      appendMemo(other, { content: "B" }, "2026-01-01T00:00:00.000Z");
      expect(readMemos(proj)).toHaveLength(1);
      expect(readMemos(other)).toHaveLength(1);
      expect(readMemos(proj)[0]!.content).toBe("A");
      expect(readMemos(other)[0]!.content).toBe("B");
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });
});

describe("appendMemo", () => {
  test("메모를 추가하고 id·시각이 채워진다", () => {
    const memo = appendMemo(proj, { content: "새 메모" }, "2026-06-01T12:00:00.000Z");
    expect(memo.content).toBe("새 메모");
    expect(memo.createdAt).toBe("2026-06-01T12:00:00.000Z");
    expect(memo.updatedAt).toBe("2026-06-01T12:00:00.000Z");
    expect(memo.id).toBeTruthy();
    expect(memo.id).toMatch(/^\d+-\d+$/);
  });

  test("쓰기는 `.gootte/` 를 만든다(Locked 3 — 만드는 쪽은 쓰기뿐)", () => {
    expect(existsSync(join(proj, ".gootte"))).toBe(false);
    appendMemo(proj, { content: "첫 메모" }, "2026-06-01T12:00:00.000Z");
    expect(existsSync(memosFile(proj))).toBe(true);
  });

  test("목록 뒤에 붙는다 — 작성 순서 보존", () => {
    const m1 = appendMemo(proj, { content: "첫" }, "2026-01-01T00:00:00.000Z");
    const m2 = appendMemo(proj, { content: "둘" }, "2026-01-02T00:00:00.000Z");
    const m3 = appendMemo(proj, { content: "셋" }, "2026-01-03T00:00:00.000Z");
    const all = readMemos(proj);
    expect(all.map((m) => m.content)).toEqual(["첫", "둘", "셋"]);
    expect(all.map((m) => m.id)).toEqual([m1.id, m2.id, m3.id]);
  });
});

describe("updateMemo", () => {
  test("내용만 바꾸고 수정 시각을 갱신한다", () => {
    const m = appendMemo(proj, { content: "원본" }, "2026-01-01T00:00:00.000Z");
    const updated = updateMemo(proj, m.id, { content: "수정됨" }, "2026-06-01T00:00:00.000Z");
    expect(updated).not.toBeNull();
    expect(updated!.content).toBe("수정됨");
    expect(updated!.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(updated!.updatedAt).toBe("2026-06-01T00:00:00.000Z");
  });

  test("없는 id 면 null", () => {
    const result = updateMemo(proj, "nonexistent", { content: "x" }, "2026-01-01T00:00:00.000Z");
    expect(result).toBeNull();
  });

  test("저장소에 반영된다 — 다시 읽으면 수정된 값", () => {
    const m = appendMemo(proj, { content: "원본" }, "2026-01-01T00:00:00.000Z");
    updateMemo(proj, m.id, { content: "변경" }, "2026-06-01T00:00:00.000Z");
    const all = readMemos(proj);
    expect(all).toHaveLength(1);
    expect(all[0]!.content).toBe("변경");
  });

  test("done 을 주면 완료 표시가 저장된다 — 내용은 그대로", () => {
    const m = appendMemo(proj, { content: "원본" }, "2026-01-01T00:00:00.000Z");
    const updated = updateMemo(proj, m.id, { content: "원본", done: true }, "2026-06-01T00:00:00.000Z");
    expect(updated!.done).toBe(true);
    expect(updated!.content).toBe("원본");
    expect(readMemos(proj)[0]!.done).toBe(true);
  });

  test("done 을 안 주면 완료 표시를 건드리지 않는다(토글에 content 만 쓰는 안전선)", () => {
    const m = appendMemo(proj, { content: "원본", done: true }, "2026-01-01T00:00:00.000Z");
    updateMemo(proj, m.id, { content: "고침" }, "2026-06-01T00:00:00.000Z");
    expect(readMemos(proj)[0]!.done).toBe(true);
    expect(readMemos(proj)[0]!.content).toBe("고침");
  });
});

describe("deleteMemo", () => {
  test("메모를 지우고 true", () => {
    const m = appendMemo(proj, { content: "지울 메모" }, "2026-01-01T00:00:00.000Z");
    expect(deleteMemo(proj, m.id)).toBe(true);
    expect(readMemos(proj)).toEqual([]);
  });

  test("없는 id 면 false", () => {
    expect(deleteMemo(proj, "nonexistent")).toBe(false);
  });

  test("여러 메모 중 하나만 지운다", () => {
    const m1 = appendMemo(proj, { content: "첫" }, "2026-01-01T00:00:00.000Z");
    const m2 = appendMemo(proj, { content: "둘" }, "2026-01-02T00:00:00.000Z");
    const m3 = appendMemo(proj, { content: "셋" }, "2026-01-03T00:00:00.000Z");
    deleteMemo(proj, m2.id);
    const all = readMemos(proj);
    expect(all.map((m) => m.content)).toEqual(["첫", "셋"]);
  });
});
