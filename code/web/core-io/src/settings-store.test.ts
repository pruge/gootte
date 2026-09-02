import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  dirExists,
  normalizeDirPath,
  readSettings,
  settingsFile,
  settingsHasWatchRoots,
  resolveWatchRoots,
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
  test("파일이 없으면 null — 소비처는 기본값으로 떨어진다", () => {
    expect(readSettings(dataDir)).toEqual({ firstmateHome: null, watchRoots: [], blockedCopies: [], autoClose: true });
  });

  test("저장한 값을 그대로 읽는다", () => {
    writeSettings(dataDir, { firstmateHome: "/tmp/fm" });
    expect(readSettings(dataDir)).toEqual({ firstmateHome: "/tmp/fm", watchRoots: [], blockedCopies: [], autoClose: true });
  });

  test("망가진 JSON 은 빈 설정으로 위장하지 않고 던진다", () => {
    writeFileSync(settingsFile(dataDir), "{ not json");
    expect(() => readSettings(dataDir)).toThrow();
  });

  // 수용 기준 6 — 저장 파일에 남아 있는 옛 watchRoot 값은 무시하고 오류 없이 읽는다
  // (spec §Data and migration: 지우는 마이그레이션도 하지 않는다).
  test("저장 파일에 남은 옛 watchRoot 값은 무시된다 — 오류 없이 firstmateHome 만 읽는다", () => {
    writeFileSync(
      settingsFile(dataDir),
      `${JSON.stringify({ watchRoot: "/옛/값", firstmateHome: "/tmp/fm" }, null, 2)}\n`,
    );
    expect(readSettings(dataDir)).toEqual({ firstmateHome: "/tmp/fm", watchRoots: [], blockedCopies: [], autoClose: true });
  });
});

describe("writeSettings", () => {
  test("들어온 키만 갈아 끼운다(merge)", () => {
    writeSettings(dataDir, {});
    writeSettings(dataDir, { firstmateHome: "/b" });
    expect(readSettings(dataDir)).toEqual({ firstmateHome: "/b", watchRoots: [], blockedCopies: [], autoClose: true });
  });

  test("null 은 지움(unset)이다", () => {
    writeSettings(dataDir, { firstmateHome: "/b" });
    writeSettings(dataDir, { firstmateHome: null });
    expect(readSettings(dataDir)).toEqual({ firstmateHome: null, watchRoots: [], blockedCopies: [], autoClose: true });
  });

  test("재시작(새 read) 후에도 유지된다 — 같은 자리를 다시 읽으면 같은 값", () => {
    writeSettings(dataDir, { firstmateHome: "/persisted" });
    // 새 프로세스가 파일에서 다시 읽는 것과 같다 — readSettings 는 메모리 캐시가 없다.
    expect(readSettings(dataDir).firstmateHome).toBe("/persisted");
  });

  test("데이터 디렉터리가 없어도 만들고 쓴다", () => {
    const nested = join(dataDir, "deep", "dir");
    writeSettings(nested, { firstmateHome: "/x" });
    expect(readSettings(nested).firstmateHome).toBe("/x");
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

describe("settingsHasWatchRoots", () => {
  test("키가 없으면 false — 파생 규칙이 적용된다", () => {
    writeSettings(dataDir, { firstmateHome: "/tmp/fm" });
    expect(settingsHasWatchRoots(dataDir)).toBe(false);
  });

  test("키가 있으면(빈 배열 포함) true — 명시 값이 권위다", () => {
    writeSettings(dataDir, { watchRoots: [] });
    expect(settingsHasWatchRoots(dataDir)).toBe(true);
    writeSettings(dataDir, { watchRoots: ["/a/projects"] });
    expect(settingsHasWatchRoots(dataDir)).toBe(true);
  });
});

describe("resolveWatchRoots", () => {
  const fallback = ["/env/projects"];

  test("키가 있으면(빈 배열 포함) 그것이 권위다 — fallback 도 건드리지 않는다", () => {
    writeSettings(dataDir, { watchRoots: ["/a/projects", "/b/projects"] });
    expect(resolveWatchRoots(dataDir, fallback)).toEqual(["/a/projects", "/b/projects"]);
    writeSettings(dataDir, { watchRoots: [] });
    expect(resolveWatchRoots(dataDir, fallback)).toEqual([]);
  });

  test("키가 없고 firstmateHome 이 있으면 홈에서 파생된다", () => {
    writeSettings(dataDir, { firstmateHome: "/tmp/fm" });
    expect(resolveWatchRoots(dataDir, fallback)).toEqual([join("/tmp/fm", "projects")]);
  });

  test("키도 없고 firstmateHome 도 없으면 fallback 으로 떨어진다", () => {
    writeSettings(dataDir, {});
    expect(resolveWatchRoots(dataDir, fallback)).toEqual(fallback);
  });
});

describe("writeSettings watchRoots", () => {
  test("들어온 키만 갈아 끼우고 나머지(키 부재)를 보존한다", () => {
    writeSettings(dataDir, { firstmateHome: "/b" });
    expect(settingsHasWatchRoots(dataDir)).toBe(false); // watchRoots 키를 안 건드렸다
    writeSettings(dataDir, { watchRoots: ["/c/projects"] });
    // firstmateHome 은 남고 watchRoots 키가 생겼다
    expect(readSettings(dataDir).firstmateHome).toBe("/b");
    expect(readSettings(dataDir).watchRoots).toEqual(["/c/projects"]);
    expect(settingsHasWatchRoots(dataDir)).toBe(true);
  });

  test("null 은 지움(unset) — 파생 규칙으로 되돌아간다", () => {
    writeSettings(dataDir, { watchRoots: ["/c/projects"] });
    writeSettings(dataDir, { watchRoots: null });
    expect(settingsHasWatchRoots(dataDir)).toBe(false);
  });
});

describe("writeSettings blockedCopies", () => {
  test("차단 목록을 그대로 저장하고, 다른 키는 건드리지 않는다", () => {
    writeSettings(dataDir, { firstmateHome: "/b", watchRoots: ["/c/projects"] });
    writeSettings(dataDir, { blockedCopies: ["pool/1", "pool/2"] });
    const s = readSettings(dataDir);
    expect(s.firstmateHome).toBe("/b");
    expect(s.watchRoots).toEqual(["/c/projects"]);
    expect(s.blockedCopies).toEqual(["pool/1", "pool/2"]);
  });

  test("빈 배열이면 명시적으로 모두 해제된다", () => {
    writeSettings(dataDir, { blockedCopies: ["pool/1"] });
    expect(readSettings(dataDir).blockedCopies).toEqual(["pool/1"]);
    writeSettings(dataDir, { blockedCopies: [] });
    expect(readSettings(dataDir).blockedCopies).toEqual([]);
  });

  test("경로 정규화를 거치지 않는다 — slug 그대로 보관", () => {
    writeSettings(dataDir, { blockedCopies: ["jinwooauto-e5b4fc/1"] });
    expect(readSettings(dataDir).blockedCopies).toEqual(["jinwooauto-e5b4fc/1"]);
  });
});
