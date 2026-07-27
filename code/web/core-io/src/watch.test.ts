import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { watchProjects, type Change, type ProjectWatcher } from "./watch";

function makeProject(root: string, slug: string): void {
  const p = join(root, slug);
  mkdirSync(join(p, ".cling"), { recursive: true });
  writeFileSync(join(p, ".cling", "profile.md"), "# profile\n");
  mkdirSync(join(p, "docs", "todo"), { recursive: true });
  writeFileSync(join(p, "docs", "todo", "001-x.md"), "---\nstatus: pending\n---\n");
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) return;
    await sleep(30);
  }
  throw new Error("waitFor timeout");
}

describe("watchProjects (022)", () => {
  let w: ProjectWatcher | null = null;
  let root = "";
  afterEach(async () => {
    await w?.close();
    w = null;
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
  });

  it("문서 변경 → {project}, 새 프로젝트 → {projects}", async () => {
    root = mkdtempSync(join(tmpdir(), "gootte-watch-"));
    makeProject(root, "alpha");
    const events: Change[] = [];
    w = watchProjects([root], (c) => events.push(c), { debounceMs: 40 });
    await sleep(500); // chokidar ready

    // 1) 문서 변경 → {project: alpha}
    writeFileSync(join(root, "alpha", "docs", "todo", "001-x.md"), "---\nstatus: done\n---\n");
    await waitFor(() => events.some((e) => e.kind === "project" && e.project === "alpha"));

    // 2) 새 프로젝트(beta) 추가 → {projects}
    makeProject(root, "beta");
    await waitFor(() => events.some((e) => e.kind === "projects"));

    // 3) beta 문서 변경 → {project: beta} (재동기된 감시)
    const before = events.length;
    writeFileSync(join(root, "beta", "docs", "todo", "001-x.md"), "x");
    await waitFor(() => events.slice(before).some((e) => e.kind === "project" && e.project === "beta"));
  });

  it("close 후 이벤트 무발화", async () => {
    root = mkdtempSync(join(tmpdir(), "gootte-watch-"));
    makeProject(root, "alpha");
    const events: Change[] = [];
    w = watchProjects([root], (c) => events.push(c), { debounceMs: 40 });
    await sleep(500);
    await w.close();
    w = null;
    const n = events.length;
    writeFileSync(join(root, "alpha", "docs", "todo", "001-x.md"), "changed");
    await sleep(300);
    expect(events.length).toBe(n);
  });
});
