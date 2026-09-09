import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import { type Project } from "@gootte/contract";
import { readFeatures } from "@gootte/core-io";
import { clearSnapshot, recordProjectScan, revalidateSnapshot, snapshotPath } from "../src/snapshot";

const makeProject = (parent: string, slug: string): string => {
  const repo = join(parent, slug);
  mkdirSync(join(repo, "docs", "features", "auth-login", "issues"), { recursive: true });
  writeFileSync(join(repo, "AGENTS.md"), "# AGENTS\n");
  writeFileSync(join(repo, "docs/features/auth-login/spec.md"), "# auth-login\n\n## Goal\n\nfirst\n");
  writeFileSync(join(repo, "docs/features/auth-login/issues/01-a.md"), "# T01\n");
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

describe("fast-cold-start T04 — 재검증 게이팅(git-removal T03/T04 이후)", () => {
  // git 스탬프(headCommit)가 사라졌으므로 판정 기준은 **사본 구성(sameCopies)과 프로젝트 목록** 둘뿐이다.
  // 문서 내용 변경은 재검증기가 아니라 감시 신호(축 1 → scheduleProjectUpdate)의 몫이다.
  test("사본 구성이 같으면 재검증은 no-op이고 스냅샷을 바꾸지 않는다", async () => {
    const root = mkdtempSync(join(tmpdir(), "gootte-t04-root-"));
    const alpha = makeProject(root, "alpha");
    try {
      recordProjectScan(dataDir, project(alpha), readFeatures([alpha]));
      const before = readFileSync(snapshotPath(dataDir), "utf8");
      const result = await revalidateSnapshot(dataDir, [root]);
      expect(result).toEqual({ changedProjects: [], projectsChanged: false });
      expect(readFileSync(snapshotPath(dataDir), "utf8")).toBe(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("한 프로젝트의 사본 구성만 바뀌면 그 프로젝트만 갱신하고 나머지는 보존한다", async () => {
    const root = mkdtempSync(join(tmpdir(), "gootte-t04-root-"));
    const alpha = makeProject(root, "alpha");
    const beta = makeProject(root, "beta");
    try {
      recordProjectScan(dataDir, project(alpha), readFeatures([alpha]));
      recordProjectScan(dataDir, project(beta), readFeatures([beta]));
      const before = JSON.parse(readFileSync(snapshotPath(dataDir), "utf8"));
      const betaBefore = before.projects.find((p: { slug: string }) => p.slug === "beta");

      // alpha 에 두 번째 사본을 붙인다 — depth 2 스캔이 잡는 자리(root/sub/alpha).
      const alphaCopy = join(root, "sub", "alpha");
      mkdirSync(join(alphaCopy, "docs", "features"), { recursive: true });
      writeFileSync(join(alphaCopy, "AGENTS.md"), "# AGENTS\n");

      const result = await revalidateSnapshot(dataDir, [root]);
      const after = JSON.parse(readFileSync(snapshotPath(dataDir), "utf8"));
      const alphaAfter = after.projects.find((p: { slug: string }) => p.slug === "alpha");
      const betaAfter = after.projects.find((p: { slug: string }) => p.slug === "beta");

      expect(result).toEqual({ changedProjects: ["alpha"], projectsChanged: false });
      // alpha는 갱신되었으니 사본 구성이 바뀌었다
      expect(alphaAfter.copies).toContain(alphaCopy);
      // beta는 보존되었다
      expect(betaAfter.copies).toEqual(betaBefore.copies);
      expect(betaAfter.features).toEqual(betaBefore.features);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("프로젝트 추가와 삭제는 projectsChanged로 판정한다", async () => {
    const root = mkdtempSync(join(tmpdir(), "gootte-t04-root-"));
    const alpha = makeProject(root, "alpha");
    try {
      recordProjectScan(dataDir, project(alpha), readFeatures([alpha]));
      const beta = makeProject(root, "beta");

      const added = await revalidateSnapshot(dataDir, [root]);
      expect(added.projectsChanged).toBe(true);
      expect(added.changedProjects).toContain("beta");

      rmSync(beta, { recursive: true, force: true });
      const removed = await revalidateSnapshot(dataDir, [root]);
      expect(removed.projectsChanged).toBe(true);
      expect(JSON.parse(readFileSync(snapshotPath(dataDir), "utf8")).projects.map((p: { slug: string }) => p.slug)).toEqual(["alpha"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
