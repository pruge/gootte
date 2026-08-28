import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { Project } from "@gootte/contract";
import { readSecondmateHomes } from "./secondmates";

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
 * env `GOOTTE_ROOTS`(콜론 구분) 파싱 — backend `defaultRoots` 와 cli 가 **같은 규칙**을 쓰게
 * 올려 둔 한 자리(the-terminal-agrees-with-the-screen T02). 값이 없거나 공백뿐이면 null —
 * 호출자가 기본값으로 떨어진다. 빈 조각은 버린다.
 */
export function parseProjectRoots(raw: string | undefined): string[] | null {
  const env = raw?.trim();
  if (!env) return null;
  return env.split(":").filter(Boolean);
}

/**
 * discover 루트 — env `GOOTTE_ROOTS` 우선, 없으면 `defaultProjectRoots()`. backend(`defaultRoots`)
 * 와 cli(`resolveProjectPath`)가 같은 규약을 쓴다. 인자로 값을 받으니 시험도 env 오염 없이 된다.
 */
export function effectiveProjectRoots(raw: string | undefined = process.env.GOOTTE_ROOTS): string[] {
  return parseProjectRoots(raw) ?? defaultProjectRoots();
}

/**
 * firstmate 홈 → 감시 뿌리 목록(one-setting-finds-every-copy T05) — 이 파생을 두는 **유일한
 * 자리**다(backend·cli 가 같은 함수를 쓴다, the-terminal-agrees-with-the-screen 의 규율).
 * `<홈>/projects` 가 먼저, 그다음 명부(`readSecondmateHomes`)에 등록된 항해사 홈들의
 * `projects` — 명부 순서 그대로. 홈 미설정(null/빈 문자열)이면 빈 목록 — 호출자가
 * `effectiveProjectRoots()` 기본값으로 떨어진다(INV-1 파생물만, 결정적·LLM-free — INV-4).
 * 존재하지 않는 뿌리는 `discoverProjects` 가 이미 건너뛰므로 여기서 걸러내지 않는다.
 */
export function deriveWatchRoots(firstmateHome: string | null | undefined): string[] {
  if (!firstmateHome?.trim()) return [];
  const homes = [firstmateHome, ...readSecondmateHomes(firstmateHome)];
  return homes.map((h) => join(h, "projects"));
}

/**
 * firstmate 프로젝트 판정 — 루트 `AGENTS.md` **와** `docs/features/` 가 둘 다 있음.
 * 둘 다 요구하는 이유는 `docs/features/firstmate-project-source/spec.md` §설계 1.
 */
export function isFirstmateProject(dir: string): boolean {
  return existsSync(join(dir, "AGENTS.md")) && isDir(join(dir, "docs", "features"));
}

/**
 * 머신 scan: root + 2단계 하위에서 프로젝트를 센다. 판정은 firstmate 규칙 하나뿐이다.
 *
 * 🔴 **같은 slug(디렉토리 basename)의 사본은 하나의 `Project` 로 묶는다(T01)** — 그래서 목록에
 * 같은 이름이 두 번 뜨지 않는다. 묶는 키는 basename 하나뿐(유사 이름 추정 금지, INV-4). 뿌리
 * 순서가 곧 `copies` 순서이고, 첫 것이 대표 경로(`path`)다. 파생물이라 어디에도 저장하지 않는다
 * (INV-1). 중복 판정은 **경로** 단위로 하고(`seen`), basename 단위로 묶는다 — 그래서 같은
 * 디렉토리가 여러 뿌리에서 겹쳐 들어와도 한 번만 센다.
 */
export function discoverProjects(roots: string[]): Project[] {
  const bySlug = new Map<string, { path: string; copies: string[] }>();
  const seen = new Set<string>(); // 경로 단위 중복 방지
  const check = (dir: string): void => {
    if (seen.has(dir)) return;
    if (!isFirstmateProject(dir)) return;
    seen.add(dir);
    const slug = basename(dir);
    const entry = bySlug.get(slug);
    if (entry) entry.copies.push(dir); // 뿌리 순서 그대로 → copies[0] 가 대표
    else bySlug.set(slug, { path: dir, copies: [dir] });
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
  return [...bySlug.values()].map((v) => ({ slug: basename(v.path), path: v.path, copies: v.copies }));
}
