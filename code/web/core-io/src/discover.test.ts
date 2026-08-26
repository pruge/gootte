import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverProjects, defaultProjectRoots, parseProjectRoots, effectiveProjectRoots } from "./discover";

let root: string;

/** 뿌리 아래 프로젝트 후보 하나를 만든다. 어떤 표식을 놓을지는 호출자가 고른다. */
function candidate(name: string, marks: { agents?: boolean; features?: boolean }): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  if (marks.agents) writeFileSync(join(dir, "AGENTS.md"), "# AGENTS\n");
  if (marks.features) mkdirSync(join(dir, "docs", "features"), { recursive: true });
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

describe("defaultProjectRoots", () => {
  it("기본 스캔 뿌리 = ~/Documents/ai2/projects", () => {
    const roots = defaultProjectRoots();
    expect(roots).toHaveLength(1);
    expect(roots[0]).toMatch(new RegExp(`${join("Documents", "ai2", "projects")}$`));
  });
});

/**
 * env `GOOTTE_ROOTS` 파싱(the-terminal-agrees-with-the-screen T02) — backend `defaultRoots` 가
 * 지금까지 쓰던 규칙을 그대로 올려 온 것이다: **전체 trim 후** 콜론 갈라, 빈 조각은 버린다.
 * 조각 안의 공백은 버리지 않는다 — 백엔드 동작이 하나도 안 바뀌는 것이 이 티켓의 조건이다.
 */
describe("parseProjectRoots · effectiveProjectRoots — GOOTTE_ROOTS 규약의 한 자리", () => {
  it("콜론 구분 — 빈 조각은 버린다", () => {
    expect(parseProjectRoots("/a:/b")).toEqual(["/a", "/b"]);
    expect(parseProjectRoots("/a::/b")).toEqual(["/a", "/b"]);
  });

  it("앞뒤 공백만 잘라 내고, 없으면 null — 호출자가 기본값으로 떨어진다", () => {
    expect(parseProjectRoots(undefined)).toBeNull();
    expect(parseProjectRoots("")).toBeNull();
    expect(parseProjectRoots("   ")).toBeNull();
    expect(parseProjectRoots(" /x ")).toEqual(["/x"]);
  });

  it("effectiveProjectRoots — env 있으면 이기고, 없으면 기본 뿌리", () => {
    expect(effectiveProjectRoots("/a:/b")).toEqual(["/a", "/b"]);
    expect(effectiveProjectRoots(undefined)).toEqual(defaultProjectRoots());
  });
});
