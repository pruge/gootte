import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  dirExists,
  normalizeDirPath,
  readSettings,
  settingsFile,
  suggestFirstmateHome,
  writeSettings,
} from "./settings-store";

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "gootte-settings-"));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe("readSettings", () => {
  test("파일이 없으면 전부 null — 소비처는 기본값으로 떨어진다", () => {
    expect(readSettings(dataDir)).toEqual({ watchRoot: null, firstmateHome: null });
  });

  test("저장한 값을 그대로 읽는다", () => {
    writeSettings(dataDir, { watchRoot: "/tmp/watch", firstmateHome: "/tmp/fm" });
    expect(readSettings(dataDir)).toEqual({
      watchRoot: "/tmp/watch",
      firstmateHome: "/tmp/fm",
    });
  });

  test("망가진 JSON 은 빈 설정으로 위장하지 않고 던진다", () => {
    writeFileSync(settingsFile(dataDir), "{ not json");
    expect(() => readSettings(dataDir)).toThrow();
  });
});

describe("writeSettings", () => {
  test("들어온 키만 갈아 끼운다(merge)", () => {
    writeSettings(dataDir, { watchRoot: "/a" });
    writeSettings(dataDir, { firstmateHome: "/b" });
    expect(readSettings(dataDir)).toEqual({ watchRoot: "/a", firstmateHome: "/b" });
  });

  test("null 은 지움(unset)이다", () => {
    writeSettings(dataDir, { watchRoot: "/a", firstmateHome: "/b" });
    writeSettings(dataDir, { watchRoot: null });
    expect(readSettings(dataDir)).toEqual({ watchRoot: null, firstmateHome: "/b" });
  });

  test("재시작(새 read) 후에도 유지된다 — 같은 자리를 다시 읽으면 같은 값", () => {
    writeSettings(dataDir, { watchRoot: "/persisted" });
    // 새 프로세스가 파일에서 다시 읽는 것과 같다 — readSettings 는 메모리 캐시가 없다.
    expect(readSettings(dataDir).watchRoot).toBe("/persisted");
  });

  test("데이터 디렉터리가 없어도 만들고 쓴다", () => {
    const nested = join(dataDir, "deep", "dir");
    writeSettings(nested, { watchRoot: "/x" });
    expect(readSettings(nested).watchRoot).toBe("/x");
  });
});

describe("normalizeDirPath", () => {
  test("trim 하고 절대 경로로 정규화한다", () => {
    expect(normalizeDirPath("  /tmp/a/../b  ")).toBe("/tmp/b");
  });

  test("~ 를 홈으로 전개한다", () => {
    expect(normalizeDirPath("~/projects")).toBe(join(homedir(), "projects"));
    expect(normalizeDirPath("~")).toBe(homedir());
  });

  test("상대 경로는 조용히 붙이지 않고 거절한다", () => {
    expect(() => normalizeDirPath("relative/path")).toThrow("절대 경로여야 합니다");
  });

  test("빈 값은 거절한다", () => {
    expect(() => normalizeDirPath("   ")).toThrow();
  });
});

describe("dirExists", () => {
  test("디렉터리면 true, 파일·없음·null 은 false", () => {
    const dir = join(dataDir, "adir");
    mkdirSync(dir);
    const file = join(dir, "f.txt");
    writeFileSync(file, "x");
    expect(dirExists(dir)).toBe(true);
    expect(dirExists(file)).toBe(false);
    expect(dirExists(join(dataDir, "nope"))).toBe(false);
    expect(dirExists(null)).toBe(false);
  });
});

describe("suggestFirstmateHome", () => {
  test("실제로 있는 첫 후보를 준다", () => {
    const existing = join(dataDir, "firstmate2");
    mkdirSync(existing);
    expect(suggestFirstmateHome([existing])).toBe(existing);
  });

  test("후보가 하나도 없으면 null(placeholder 생략)", () => {
    expect(suggestFirstmateHome([join(dataDir, "없음")])).toBeNull();
  });

  test("먼저 오는 존재하는 후보를 준다 — 순서가 우선순위", () => {
    const missing = join(dataDir, "없음");
    const existing = join(dataDir, "firstmate2");
    mkdirSync(existing);
    expect(suggestFirstmateHome([missing, existing])).toBe(existing);
  });
});
