import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { backlogFile } from "./backlog-watch";
import { readBacklogTasks } from "./backlog";

let home = "";
afterEach(() => {
  if (home) rmSync(home, { recursive: true, force: true });
  home = "";
});

describe("readBacklogTasks — firstmate 홈 백로그 리더(T04)", () => {
  it("`data/backlog.md` 를 읽어 작업 목록으로 낸다", () => {
    home = mkdtempSync(join(tmpdir(), "gootte-backlogread-"));
    mkdirSync(join(home, "data"), { recursive: true });
    writeFileSync(
      backlogFile(home),
      "# Backlog\n\n## In flight\n- [ ] widget-t01 - 제목 (repo: widget) (kind: ship) (since 2026-08-25)\n",
    );

    const tasks = readBacklogTasks(home);
    expect(tasks.map((t) => t.id)).toEqual(["widget-t01"]);
  });

  it("홈이 미설정이면 빈 목록(예외로 죽지 않는다)", () => {
    expect(readBacklogTasks(null)).toEqual([]);
    expect(readBacklogTasks(undefined)).toEqual([]);
    expect(readBacklogTasks("")).toEqual([]);
  });

  it("백로그 파일이 아직 없으면 빈 목록", () => {
    home = mkdtempSync(join(tmpdir(), "gootte-backlogread-"));
    expect(readBacklogTasks(home)).toEqual([]);
  });
});
