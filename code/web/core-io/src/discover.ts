import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { Project } from "@gootte/contract";

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}
function children(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** T6 — 머신 scan: root + 2단계 하위에서 `.cling/profile.md` 가진 디렉토리 = cling 프로젝트. */
export function discoverProjects(roots: string[]): Project[] {
  const found: Project[] = [];
  const seen = new Set<string>();
  const check = (dir: string): void => {
    if (!seen.has(dir) && existsSync(join(dir, ".cling", "profile.md"))) {
      seen.add(dir);
      found.push({ slug: basename(dir), path: dir });
    }
  };
  for (const root of roots) {
    if (!isDir(root)) continue;
    check(root);
    for (const l1 of children(root)) {
      const d1 = join(root, l1);
      if (!isDir(d1)) continue;
      check(d1);
      for (const l2 of children(d1)) {
        const d2 = join(d1, l2);
        if (isDir(d2)) check(d2);
      }
    }
  }
  return found;
}
