import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import { type Project } from "@gootte/contract";
import { readFeatures } from "@gootte/core-io";
import { clearSnapshot, recordProjectScan, revalidateSnapshot, snapshotPath } from "../src/snapshot";

const git = (repo: string, ...args: string[]): string =>
  execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();

const makeRepoProject = (parent: string, slug: string): string => {
  const repo = join(parent, slug);
  mkdirSync(join(repo, "docs", "features", "auth-login", "issues"), { recursive: true });
  writeFileSync(join(repo, "AGENTS.md"), "# AGENTS\n");
  writeFileSync(join(repo, "docs/features/auth-login/spec.md"), "# auth-login\n\n## Goal\n\nfirst\n");
  writeFileSync(join(repo, "docs/features/auth-login/issues/01-a.md"), "# T01\n");
  execFileSync("git", ["init", "-q", repo], { stdio: "ignore" });
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "user.name", "test");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "initial");
  return repo;
};

const project = (repo: string): Project => ({
  slug: repo.split("/").pop() ?? "project",
  path: repo,
  copies: [repo],
});

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "gootte-t04-data-"));
  clearSnapshot();
  return () => rmSync(dataDir, { recursive: true, force: true });
});

describe("fast-cold-start T04", () => {
  test("HEAD가 같으면 재검증은 no-op이고 스냅샷을 바꾸지 않는다", () => {
    const root = mkdtempSync(join(tmpdir(), "gootte-t04-root-"));
    const alpha = makeRepoProject(root, "alpha");
    try {
      recordProjectScan(dataDir, project(alpha), readFeatures([alpha]));
      const before = readFileSync(snapshotPath(dataDir), "utf8");
      const result = revalidateSnapshot(dataDir, [root]);
      expect(result).toEqual({ changedProjects: [], projectsChanged: false });
      expect(readFileSync(snapshotPath(dataDir), "utf8")).toBe(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("한 프로젝트의 HEAD만 바뀌면 그 프로젝트만 갱신하고 나머지는 보존한다", () => {
    const root = mkdtempSync(join(tmpdir(), "gootte-t04-root-"));
    const alpha = makeRepoProject(root, "alpha");
    const beta = makeRepoProject(root, "beta");
    try {
      recordProjectScan(dataDir, project(alpha), readFeatures([alpha]));
      recordProjectScan(dataDir, project(beta), readFeatures([beta]));
      const before = JSON.parse(readFileSync(snapshotPath(dataDir), "utf8"));
      const betaBefore = before.projects.find((p: { slug: string }) => p.slug === "beta");

      writeFileSync(join(alpha, "docs/features/auth-login/spec.md"), "# auth-login\n\n## Goal\n\nchanged\n");
      git(alpha, "add", "-A");
      git(alpha, "commit", "-q", "-m", "changed");

      const result = revalidateSnapshot(dataDir, [root]);
      const after = JSON.parse(readFileSync(snapshotPath(dataDir), "utf8"));
      const alphaAfter = after.projects.find((p: { slug: string }) => p.slug === "alpha");
      const betaAfter = after.projects.find((p: { slug: string }) => p.slug === "beta");

       expect(result).toEqual({ changedProjects: ["alpha"], projectsChanged: false });
       expect(alphaAfter.stamps[0].head).toBe(git(alpha, "rev-parse", "HEAD"));
       // alpha는 갱신되었으니 stamps가 바뀌었다
       expect(alphaAfter.stamps[0].head).not.toBe(betaAfter.stamps[0].head);
       // beta는 보존되었다
       expect(betaAfter.stamps).toEqual(betaBefore.stamps);
       expect(betaAfter.features).toEqual(betaBefore.features);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("프로젝트 추가와 삭제는 projectsChanged로 판정한다", () => {
    const root = mkdtempSync(join(tmpdir(), "gootte-t04-root-"));
    const alpha = makeRepoProject(root, "alpha");
    try {
      recordProjectScan(dataDir, project(alpha), readFeatures([alpha]));
      const beta = makeRepoProject(root, "beta");

      const added = revalidateSnapshot(dataDir, [root]);
      expect(added.projectsChanged).toBe(true);
      expect(added.changedProjects).toContain("beta");

      rmSync(beta, { recursive: true, force: true });
      const removed = revalidateSnapshot(dataDir, [root]);
      expect(removed.projectsChanged).toBe(true);
      expect(JSON.parse(readFileSync(snapshotPath(dataDir), "utf8")).projects.map((p: { slug: string }) => p.slug)).toEqual(["alpha"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
