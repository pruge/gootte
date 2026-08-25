import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { archivedBacklogFile, backlogFile } from "./backlog-watch";
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

  it("done-archive.md 에만 있는 작업도 done 으로 병합한다(T05 검수 — 아카이빙돼도 조인 유지)", () => {
    home = mkdtempSync(join(tmpdir(), "gootte-backlogread-"));
    mkdirSync(join(home, "data"), { recursive: true });
    writeFileSync(
      backlogFile(home),
      "# Backlog\n\n## In flight\n- [ ] widget-t02 - 살아있는 작업 (repo: widget) (kind: ship) (since 2026-08-25)\n",
    );
    writeFileSync(
      archivedBacklogFile(home),
      "\n## Archived 2026-08-24\n- [x] widget-t01 - 아카이빙된 작업 https://x/pr/1 (repo: widget) (kind: ship) (merged 2026-08-24)\n",
    );

    const tasks = readBacklogTasks(home);
    expect(tasks.map((t) => [t.id, t.section])).toEqual([
      ["widget-t02", "in_flight"],
      ["widget-t01", "done"],
    ]);
  });

  it("같은 id 가 양쪽에 있으면 살아있는 backlog.md 쪽을 우선한다", () => {
    home = mkdtempSync(join(tmpdir(), "gootte-backlogread-"));
    mkdirSync(join(home, "data"), { recursive: true });
    writeFileSync(
      backlogFile(home),
      "# Backlog\n\n## In flight\n- [ ] widget-t01 - 아직 진행중 (repo: widget) (kind: ship) (since 2026-08-25)\n",
    );
    writeFileSync(
      archivedBacklogFile(home),
      "\n## Archived 2026-08-24\n- [x] widget-t01 - 낡은 사본 (repo: widget) (kind: ship) (merged 2026-08-24)\n",
    );

    const tasks = readBacklogTasks(home);
    expect(tasks.map((t) => [t.id, t.section])).toEqual([["widget-t01", "in_flight"]]);
  });

  it("done-archive.md 가 아직 없으면 backlog.md 만으로 조용히 끝난다", () => {
    home = mkdtempSync(join(tmpdir(), "gootte-backlogread-"));
    mkdirSync(join(home, "data"), { recursive: true });
    writeFileSync(
      backlogFile(home),
      "# Backlog\n\n## In flight\n- [ ] widget-t01 - 제목 (repo: widget) (kind: ship) (since 2026-08-25)\n",
    );
    expect(readBacklogTasks(home).map((t) => t.id)).toEqual(["widget-t01"]);
  });
});
