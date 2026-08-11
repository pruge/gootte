import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import { discoverProjects } from "@gootte/core-io";
import { CliError } from "./args";
import { discoverText, dropText, nextText, orderText, setFeatureText, setTicketText } from "./commands";

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

describe("cli — set·set-feature·drop·order·next wiring(티켓 01·02)", () => {
  let dataDir: string;
  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "gootte-plan-"));
  });

  it("set-feature — --why 없이 거절한다", () => {
    expect(() => setFeatureText(["p", "a", "--track", "web", "--rank", "10"], dataDir)).toThrow(CliError);
  });

  it("set — --why 없이 거절한다", () => {
    expect(() => setTicketText(["p", "a/01", "--step", "1"], dataDir)).toThrow(CliError);
  });

  it("set-feature → order 가 적은 것을 그대로 되읽는다", () => {
    setFeatureText(["p", "a", "--track", "web", "--rank", "10", "--why", "먼저"], dataDir);
    setTicketText(["p", "a/01", "--step", "1", "--why", "먼저"], dataDir);
    const text = orderText(["p"], dataDir);
    expect(text).toContain("web");
    expect(text).toContain("a/01");
  });

  it("order --json — PlanOrder 형태로 나온다", () => {
    setFeatureText(["p", "a", "--track", "web", "--rank", "10", "--why", "…"], dataDir);
    const parsed = JSON.parse(orderText(["p", "--json"], dataDir));
    expect(parsed.features).toHaveLength(1);
    expect(parsed.mismatches).toEqual([]);
  });

  it("drop — 두 번째 set 없이 지우면 order 에서 사라진다", () => {
    setFeatureText(["p", "a", "--track", "web", "--rank", "10", "--why", "…"], dataDir);
    dropText(["p", "a"], dataDir);
    const parsed = JSON.parse(orderText(["p", "--json"], dataDir));
    expect(parsed.features).toEqual([]);
  });

  it("next --json — 계획이 없으면 빈 트랙 목록", () => {
    const parsed = JSON.parse(nextText(["p", "--json"], dataDir));
    expect(parsed.tracks).toEqual([]);
  });
});
