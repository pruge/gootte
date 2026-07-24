import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, it, expect } from "vitest";
import { conflictRisk, overlapFiles, mergeBase, scanWorktrees } from "./git";

function g(repo: string, args: string[]): void {
  execFileSync("git", ["-C", repo, ...args], { stdio: "pipe" });
}
function rev(repo: string, ref = "HEAD"): string {
  return execFileSync("git", ["-C", repo, "rev-parse", ref], { encoding: "utf8" }).trim();
}
const TEN = "l1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nl9\nl10\n";

describe("core-io git primitive — B1 conflictRisk", () => {
  let repo: string;
  let base: string;
  let mainTip: string;

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), "gootte-git-"));
    g(repo, ["init", "-q", "-b", "main"]);
    g(repo, ["config", "user.email", "t@t"]);
    g(repo, ["config", "user.name", "t"]);
    writeFileSync(join(repo, "a.txt"), TEN);
    writeFileSync(join(repo, "b.txt"), "b1\n");
    g(repo, ["add", "."]);
    g(repo, ["commit", "-qm", "base"]);
    base = rev(repo);
    // main: a.txt 첫 줄 변경
    writeFileSync(join(repo, "a.txt"), "MAIN\n" + TEN.slice(3));
    g(repo, ["commit", "-aqm", "main"]);
    mainTip = rev(repo);
  });

  function wt(name: string, mutate: () => void): string {
    g(repo, ["checkout", "-q", "-b", name, base]);
    mutate();
    g(repo, ["commit", "-aqm", name]);
    const tip = rev(repo);
    g(repo, ["checkout", "-q", "main"]);
    return tip;
  }

  it("high — 같은 파일 같은 줄 충돌", () => {
    const tip = wt("wt-high", () => writeFileSync(join(repo, "a.txt"), "WT\n" + TEN.slice(3)));
    expect(conflictRisk(repo, base, mainTip, tip)).toBe("high");
  });

  it("med — 같은 파일 다른 줄 (충돌 없음 + overlap)", () => {
    const tip = wt("wt-med", () =>
      writeFileSync(join(repo, "a.txt"), TEN.replace("l10", "WT10")),
    );
    expect(overlapFiles(repo, base, mainTip, tip)).toContain("a.txt");
    expect(conflictRisk(repo, base, mainTip, tip)).toBe("med");
  });

  it("low — 다른 파일 (overlap 없음)", () => {
    const tip = wt("wt-low", () => writeFileSync(join(repo, "b.txt"), "b1\nWT\n"));
    expect(overlapFiles(repo, base, mainTip, tip)).toHaveLength(0);
    expect(conflictRisk(repo, base, mainTip, tip)).toBe("low");
  });

  it("mergeBase / scanWorktrees(빈 repo)", () => {
    expect(mergeBase(repo, "main", "main")).toBe(mainTip);
    expect(scanWorktrees(repo)).toEqual([]); // .claude/worktrees 없음
  });
});
