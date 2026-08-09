import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, it, expect } from "vitest";
import { mergeBase, scanWorktrees } from "./git";

function g(repo: string, args: string[]): void {
  execFileSync("git", ["-C", repo, ...args], { stdio: "pipe" });
}
function rev(repo: string, ref = "HEAD"): string {
  return execFileSync("git", ["-C", repo, "rev-parse", ref], { encoding: "utf8" }).trim();
}

describe("core-io git primitive", () => {
  let repo: string;
  let mainTip: string;

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), "gootte-git-"));
    g(repo, ["init", "-q", "-b", "main"]);
    g(repo, ["config", "user.email", "t@t"]);
    g(repo, ["config", "user.name", "t"]);
    writeFileSync(join(repo, "a.txt"), "a1\n");
    g(repo, ["add", "."]);
    g(repo, ["commit", "-qm", "base"]);
    mainTip = rev(repo);
  });

  it("mergeBase / scanWorktrees(빈 repo)", () => {
    expect(mergeBase(repo, "main", "main")).toBe(mainTip);
    expect(scanWorktrees(repo)).toEqual([]); // .claude/worktrees 없음
  });
});
