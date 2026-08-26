import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseSecondmateHomes, readSecondmateHomes, secondmatesFile } from "./secondmates";

let home = "";
afterEach(() => {
  if (home) rmSync(home, { recursive: true, force: true });
  home = "";
});

describe("parseSecondmateHomes — 명부 파서(결정적, INV-4)", () => {
  it("`home: <경로>` 줄만 명부 순 그대로 뽑는다", () => {
    // 실물 두 줄(2026-08-26) 모양
    const content = [
      "# Secondmates",
      "",
      "home: /Users/pruge/.treehouse/firstmate2-4b2429/1/firstmate2",
      "home: /Users/pruge/.treehouse/firstmate2-4b2429/2/firstmate2",
      "",
    ].join("\n");
    expect(parseSecondmateHomes(content)).toEqual([
      "/Users/pruge/.treehouse/firstmate2-4b2429/1/firstmate2",
      "/Users/pruge/.treehouse/firstmate2-4b2429/2/firstmate2",
    ]);
  });

  it("나머지 줄은 무시하고, 중복 경로는 첫 번째만 남긴다", () => {
    const content = [
      "secondmate: 누군가의 사본", // home: 이 아닌 줄
      "home: /a/firstmate2",
      "  home:   /b/firstmate2  ", // 앞뒤 공백 허용
      "home:", // 빈 값 — 후보 아님
      "home: /a/firstmate2", // 중복 — 첫 번째가 이긴다
    ].join("\n");
    expect(parseSecondmateHomes(content)).toEqual(["/a/firstmate2", "/b/firstmate2"]);
  });

  it("빈 내용이면 빈 목록", () => {
    expect(parseSecondmateHomes("")).toEqual([]);
  });
});

describe("readSecondmateHomes — 명부 리더", () => {
  it("명부 파일에서 홈 목록을 낸다", () => {
    home = mkdtempSync(join(tmpdir(), "gootte-secondmates-"));
    mkdirSync(join(home, "data"), { recursive: true });
    writeFileSync(secondmatesFile(home), "home: /mate/one\nhome: /mate/two\n");

    expect(readSecondmateHomes(home)).toEqual(["/mate/one", "/mate/two"]);
  });

  it("명부가 없거나 홈이 미설정이면 빈 목록 — 예외로 죽지 않는다", () => {
    expect(readSecondmateHomes("/없는/홈")).toEqual([]);
    expect(readSecondmateHomes(null)).toEqual([]);
    expect(readSecondmateHomes(undefined)).toEqual([]);
    expect(readSecondmateHomes("")).toEqual([]);
  });
});
