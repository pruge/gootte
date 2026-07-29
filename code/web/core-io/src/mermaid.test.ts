import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readMermaidDocs } from "./mermaid";

let repo: string;
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "gootte-mmd-"));
});
afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("readMermaidDocs", () => {
  it("*.md 수집 · INDEX.md 제외 · M-ID asc 정렬", () => {
    const dir = join(repo, "docs", "mermaid");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "M-0002-b.md"), "b");
    writeFileSync(join(dir, "M-0001-a.md"), "a");
    writeFileSync(join(dir, "INDEX.md"), "index");
    writeFileSync(join(dir, "notes.txt"), "x"); // .md 아님 → 제외

    const docs = readMermaidDocs(repo);
    expect(docs.map((d) => d.file)).toEqual(["M-0001-a.md", "M-0002-b.md"]);
    expect(docs[0]!.content).toBe("a");
  });

  it("docs/mermaid 없으면 []", () => {
    expect(readMermaidDocs(repo)).toEqual([]);
  });
});
