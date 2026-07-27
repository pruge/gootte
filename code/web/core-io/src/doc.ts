import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

export type DocKind = "todo" | "sprint";

export interface LoadedDoc {
  kind: DocKind;
  name: string;
  /** repo 기준 상대 경로 (archive 여부 반영). */
  path: string;
  archived: boolean;
  content: string;
}

/**
 * 관리대상 프로젝트의 특정 문서(todo/sprint)를 raw md 로 읽는다 — INV-2(read-only).
 * `docs/<kind>/<name>.md` → 없으면 `docs/<kind>/archive/` 확인. name 은 basename 강제(경로 traversal 차단).
 */
export function readDoc(repoPath: string, kind: DocKind, name: string): LoadedDoc | null {
  const safeName = basename(name).replace(/\.md$/, ""); // 방어 — 경로 분리자·확장자 제거
  if (!safeName || safeName.startsWith(".")) return null;

  const candidates: { archived: boolean; base: string }[] = [
    { archived: false, base: join(repoPath, "docs", kind) },
    { archived: true, base: join(repoPath, "docs", kind, "archive") },
  ];
  for (const { archived, base } of candidates) {
    const file = join(base, `${safeName}.md`);
    if (existsSync(file)) {
      return {
        kind,
        name: safeName,
        path: join("docs", kind, archived ? "archive" : "", `${safeName}.md`),
        archived,
        content: readFileSync(file, "utf8"),
      };
    }
  }
  return null;
}
