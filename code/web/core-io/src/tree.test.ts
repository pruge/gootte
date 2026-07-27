import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveInitiativeDir, listInitiativeTree } from "./tree";
import { readRoadmapDoc } from "./doc";

let repo: string;

// 2-level(blueprint) 레이아웃: docs/roadmap/<epic>/<init>/
function scaffold(): void {
  const initDir = join(repo, "docs", "roadmap", "project-manager", "doc-browser");
  mkdirSync(join(initDir, "adr"), { recursive: true });
  writeFileSync(join(initDir, "spec.md"), "# spec\n");
  writeFileSync(join(initDir, "brief.md"), "# brief\n");
  writeFileSync(join(initDir, "adr", "0001-x.md"), "# ADR-0001\n");
  writeFileSync(join(initDir, "adr", "0002-y.md"), "# ADR-0002\n");
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "gootte-tree-"));
  scaffold();
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe("resolveInitiativeDir — 2-level 폴더 해소(INV-4 결정적)", () => {
  it("depth 2 (epic/<init>) 폴더 해소", () => {
    expect(resolveInitiativeDir(repo, "doc-browser")).toBe(
      join("docs", "roadmap", "project-manager", "doc-browser"),
    );
  });

  it("depth 1 (<init>) 도 해소", () => {
    const d1 = join(repo, "docs", "roadmap", "solo-init");
    mkdirSync(d1, { recursive: true });
    writeFileSync(join(d1, "spec.md"), "# s\n");
    expect(resolveInitiativeDir(repo, "solo-init")).toBe(join("docs", "roadmap", "solo-init"));
  });

  it("spec/brief 없는 폴더는 미해소(null)", () => {
    mkdirSync(join(repo, "docs", "roadmap", "project-manager", "empty-dir"), { recursive: true });
    expect(resolveInitiativeDir(repo, "empty-dir")).toBeNull();
  });

  it("미존재 이니셔티브 = null · 경로분리자 방어", () => {
    expect(resolveInitiativeDir(repo, "nope")).toBeNull();
    expect(resolveInitiativeDir(repo, "../etc")).toBeNull();
  });
});

describe("listInitiativeTree — 실제 파일 + adr/ + 가상 todo/", () => {
  it("폴더 파일·adr 서브폴더 + 가상 todo/(pending 먼저→done)", () => {
    const item = { done: ["016-done-x"], pending: ["028-wip-b", "027-wip-a"] };
    const nodes = listInitiativeTree(repo, "doc-browser", item);
    const paths = nodes.map((n) => n.path);
    expect(paths).toContain("spec.md");
    expect(paths).toContain("brief.md");
    expect(paths).toContain("adr");
    expect(paths).toContain("adr/0001-x.md");
    expect(paths).toContain("todo");
    // 가상 todo: pending(정렬) 먼저 → done
    const todoFiles = nodes.filter((n) => n.path.startsWith("todo/")).map((n) => n.name);
    expect(todoFiles).toEqual(["027-wip-a.md", "028-wip-b.md", "016-done-x.md"]);
    // read 참조 — roadmap 파일 vs todo 소스 분기
    const spec = nodes.find((n) => n.path === "spec.md");
    expect(spec?.read).toEqual({ source: "roadmap", initiative: "doc-browser", relPath: "spec.md" });
    const wip = nodes.find((n) => n.path === "todo/028-wip-b");
    expect(wip?.read).toEqual({ source: "todo", name: "028-wip-b" });
    expect(wip?.badge).toBe("진행");
  });

  it("폴더 없는 blueprint stub — 가상 todo/ 만", () => {
    const nodes = listInitiativeTree(repo, "no-folder-init", { done: [], pending: ["001-a"] });
    expect(nodes.map((n) => n.path)).toEqual(["todo", "todo/001-a"]);
  });
});

describe("readRoadmapDoc — read + traversal 가드(INV-2)", () => {
  it("폴더 상대경로 read (루트·서브폴더)", () => {
    expect(readRoadmapDoc(repo, "doc-browser", "spec.md")?.content).toBe("# spec\n");
    const adr = readRoadmapDoc(repo, "doc-browser", "adr/0001-x.md");
    expect(adr?.content).toBe("# ADR-0001\n");
    expect(adr?.kind).toBe("roadmap");
    expect(adr?.name).toBe("adr/0001-x.md");
  });

  it("🔴 traversal reject — `..`·절대경로·`.`선행", () => {
    // 폴더 밖 비밀 파일
    writeFileSync(join(repo, "secret.md"), "SECRET\n");
    expect(readRoadmapDoc(repo, "doc-browser", "../../../secret.md")).toBeNull();
    expect(readRoadmapDoc(repo, "doc-browser", "/etc/hosts")).toBeNull();
    expect(readRoadmapDoc(repo, "doc-browser", "./../secret.md")).toBeNull();
  });

  it("md 아닌 파일·미존재 = null", () => {
    writeFileSync(join(join(repo, "docs", "roadmap", "project-manager", "doc-browser"), "x.txt"), "x");
    expect(readRoadmapDoc(repo, "doc-browser", "x.txt")).toBeNull();
    expect(readRoadmapDoc(repo, "doc-browser", "nope.md")).toBeNull();
    expect(readRoadmapDoc(repo, "unknown-init", "spec.md")).toBeNull();
  });
});
