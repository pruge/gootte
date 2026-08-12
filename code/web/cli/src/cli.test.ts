import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { beforeAll, describe, it, expect } from "vitest";
import { discoverProjects } from "@gootte/core-io";
import { CliError } from "./args";
import { discoverText, nextText } from "./commands";

function w(root: string, rel: string, content: string): void {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

describe("cli — discover wiring", () => {
  let proj: string;
  beforeAll(() => {
    proj = mkdtempSync(join(tmpdir(), "gootte-proj-"));
    w(proj, "AGENTS.md", "# AGENTS\n");
    w(proj, "docs/features/f/issues/01-x.md", "# 01 — x\n\n**Status:** ready-for-agent\n");
  });

  it("discover — AGENTS.md + docs/features/ 탐지", () => {
    expect(discoverProjects([proj]).map((p) => p.slug)).toContain(basename(proj));
    expect(discoverText([proj])).toContain(basename(proj));
  });

  it("discover — 표식 없는 디렉토리는 빈 목록 문구", () => {
    expect(discoverText([mkdtempSync(join(tmpdir(), "gootte-empty-"))])).toBe("(프로젝트 없음)");
  });
});

describe("cli — next(plan-board/01, 자리만 비워 둔다)", () => {
  it("next — 프로젝트 없이 거절한다", () => {
    expect(() => nextText([])).toThrow(CliError);
  });

  it("next — 아직 없다고 말한다", () => {
    expect(nextText(["p"])).toContain("아직 없다");
  });
});
