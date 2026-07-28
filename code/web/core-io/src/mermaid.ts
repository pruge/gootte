import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RawMermaidDoc } from "@gootte/core";

/**
 * 관리대상 프로젝트 `docs/mermaid/*.md`(저작 다이어그램) raw 수집 — INV-2 read-only.
 * `INDEX.md`(색인)는 제외. 폴더 없으면 `[]`. 정렬 = 파일명(M-ID) asc(결정적).
 */
export function readMermaidDocs(repoPath: string): RawMermaidDoc[] {
  const dir = join(repoPath, "docs", "mermaid");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== "INDEX.md")
    .sort()
    .map((f) => ({ file: f, content: readFileSync(join(dir, f), "utf8") }));
}
