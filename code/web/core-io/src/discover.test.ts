import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverProjects, defaultProjectRoots } from "./discover";

let root: string;

/** 뿌리 아래 프로젝트 후보 하나를 만든다. 어떤 표식을 놓을지는 호출자가 고른다. */
function candidate(
  name: string,
  marks: { agents?: boolean; features?: boolean; cling?: boolean },
): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  if (marks.agents) writeFileSync(join(dir, "AGENTS.md"), "# AGENTS\n");
  if (marks.features) mkdirSync(join(dir, "docs", "features"), { recursive: true });
  if (marks.cling) {
    mkdirSync(join(dir, ".cling"), { recursive: true });
    writeFileSync(join(dir, ".cling", "profile.md"), "# profile\n");
  }
  return dir;
}

const slugs = (roots: string[]): string[] => discoverProjects(roots).map((p) => p.slug);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "gootte-discover-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("discoverProjects — firstmate 판정(루트 AGENTS.md + docs/features/)", () => {
  it("둘 다 있으면 프로젝트로 센다", () => {
    candidate("jinwooauto", { agents: true, features: true });
    expect(slugs([root])).toEqual(["jinwooauto"]);
  });

  it("🔴 AGENTS.md 만 있으면 세지 않는다 — firstmate 저장소 자신·격리 사본이 딸려 들어온다", () => {
    candidate("firstmate", { agents: true });
    expect(slugs([root])).toEqual([]);
  });

  it("🔴 docs/features/ 만 있으면 세지 않는다 — 아직 firstmate 관리가 아닌 저장소가 섞인다", () => {
    candidate("not-yet-managed", { features: true });
    expect(slugs([root])).toEqual([]);
  });

  it("뿌리가 아예 없으면 빈 목록 — 예외로 죽지 않는다", () => {
    expect(() => discoverProjects([join(root, "nope", "nowhere")])).not.toThrow();
    expect(slugs([join(root, "nope", "nowhere")])).toEqual([]);
  });

  it("표식 없는 디렉토리는 무시하고, 뿌리 자신도 판정 대상이다", () => {
    candidate("plain-repo", {});
    const proj = candidate("gootte", { agents: true, features: true });
    expect(slugs([root])).toEqual(["gootte"]);
    expect(slugs([proj])).toEqual(["gootte"]); // 뿌리 자신
  });

  it("2단계 하위까지 찾고, 같은 경로를 중복해 세지 않는다", () => {
    const nested = join(root, "group", "deep-proj");
    mkdirSync(join(nested, "docs", "features"), { recursive: true });
    writeFileSync(join(nested, "AGENTS.md"), "# AGENTS\n");
    expect(slugs([root, root])).toEqual(["deep-proj"]);
  });
});

describe("discoverProjects — 옛 cling 규칙과의 공존(제거는 티켓 04)", () => {
  it("cling 프로젝트도 계속 잡힌다", () => {
    candidate("legacy", { cling: true });
    expect(slugs([root])).toEqual(["legacy"]);
  });

  it("두 규칙에 모두 맞아도 한 번만 센다", () => {
    candidate("both", { agents: true, features: true, cling: true });
    expect(slugs([root])).toEqual(["both"]);
  });
});

describe("defaultProjectRoots", () => {
  it("기본 스캔 뿌리 = ~/Documents/ai2/projects", () => {
    const roots = defaultProjectRoots();
    expect(roots).toHaveLength(1);
    expect(roots[0]).toMatch(new RegExp(`${join("Documents", "ai2", "projects")}$`));
  });
});
