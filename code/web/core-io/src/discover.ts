import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
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

/**
 * 스캔 뿌리 기본값 — 캡틴의 firstmate 프로젝트 모음.
 * 덮어쓰기는 호출자 몫(backend `GOOTTE_ROOTS`, cli 인자).
 */
export function defaultProjectRoots(): string[] {
  return [join(homedir(), "Documents", "ai2", "projects")];
}

/**
 * firstmate 프로젝트 판정 — 루트 `AGENTS.md` **와** `docs/features/` 가 둘 다 있음.
 * 둘 다 요구하는 이유는 `docs/features/firstmate-project-source/spec.md` §설계 1.
 */
export function isFirstmateProject(dir: string): boolean {
  return existsSync(join(dir, "AGENTS.md")) && isDir(join(dir, "docs", "features"));
}

/** 머신 scan: root + 2단계 하위에서 프로젝트를 센다. 판정은 firstmate 규칙 하나뿐이다. */
export function discoverProjects(roots: string[]): Project[] {
  const found: Project[] = [];
  const seen = new Set<string>();
  const check = (dir: string): void => {
    if (seen.has(dir)) return;
    if (!isFirstmateProject(dir)) return;
    seen.add(dir);
    found.push({ slug: basename(dir), path: dir });
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
