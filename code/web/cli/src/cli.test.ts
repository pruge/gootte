import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, it, expect } from "vitest";
import { discoverProjects, readSteps, writePlanMove } from "@gootte/core-io";
import { CliError } from "./args";
import { boardText, discoverText, nextText, stepClearText, stepText } from "./commands";

function w(root: string, rel: string, content: string): void {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

/** 기능 하나를 작업 대상에 올린다 — `step` 테스트가 매길 자리를 만든다(캡틴이 끌어 놓은 결과). */
function activate(dataDir: string, project: string, feature: string): void {
  writePlanMove(dataDir, project, {
    upsert: [{ feature, area: "active", seq: 0, closedAt: null }],
    remove: [],
    clearSteps: [],
    setSteps: [],
  });
}

describe("cli — discover wiring", () => {
  let proj: string;
  beforeAll(() => {
    proj = mkdtempSync(join(tmpdir(), "gootte-proj-"));
    w(proj, "AGENTS.md", "# AGENTS\n");
    w(proj, "docs/features/f/issues/01-x.md", "# 01 — x\n\n**Status:** ready-for-agent\n");
  });

  it("discover — AGENTS.md + docs/features/ 탐지", () => {
    expect(discoverProjects([proj]).map((p) => p.slug)).toContain(basename(proj));
    expect(discoverText([proj])).toContain(basename(proj));
  });

  it("discover — 표식 없는 디렉토리는 빈 목록 문구", () => {
    expect(discoverText([mkdtempSync(join(tmpdir(), "gootte-empty-"))])).toBe("(프로젝트 없음)");
  });
});

/**
 * `step` · `step --clear` · `board` · `next`(plan-board/05) — 실제 프로젝트 픽스처 + 임시 계획
 * DB 로 배선을 잰다. **판정 자체**(당김·1단계만)는 `core/src/plan/step.test.ts`·`next.test.ts` 가
 * 덮는다 — 여기서 보는 것은 CLI 가 그 함수들을 옳게 부르고 출력 모양이 맞는가다.
 */
describe("cli — step · step --clear · board · next(plan-board/05)", () => {
  let proj: string;
  let dataDir: string;

  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), "gootte-step-proj-"));
    dataDir = mkdtempSync(join(tmpdir(), "gootte-step-db-"));
    w(proj, "AGENTS.md", "# AGENTS\n");
    w(
      proj,
      "docs/features/f/issues/01-a.md",
      "# 01 — a\n\n**Status:** ready-for-agent\n\n**Blocked by:** 없음\n",
    );
    w(
      proj,
      "docs/features/f/issues/02-b.md",
      "# 02 — b\n\n**Status:** ready-for-agent\n\n**Blocked by:** 없음\n",
    );
  });
  afterEach(() => {
    rmSync(proj, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  });

  const slug = () => basename(proj);

  it("step — 프로젝트/기능/티켓 없이 거절한다", () => {
    expect(() => stepText([], dataDir, proj)).toThrow(CliError);
    expect(() => stepText([slug()], dataDir, proj)).toThrow(CliError);
  });

  it("step — 없는 프로젝트는 거절한다", () => {
    expect(() => stepText(["ghost", "f/01-a", "1"], dataDir, proj)).toThrow(CliError);
  });

  it("step — 작업 대상에 없는 기능은 거절한다(단계는 작업 대상에 있는 동안만 존재)", () => {
    expect(() => stepText([slug(), "f/01-a", "1"], dataDir, proj)).toThrow(
      /작업 대상에 없다/,
    );
  });

  it("step — 문서에 없는 티켓은 거절한다", () => {
    expect(() => stepText([slug(), "f/99-x", "1"], dataDir, proj)).toThrow(/티켓 없음/);
  });

  it("step — 🔴 --why 를 비롯해 어떤 플래그도 받지 않는다", () => {
    expect(() => stepText([slug(), "f/01-a", "1", "--why", "이유"], dataDir, proj)).toThrow(
      /받지 않는다/,
    );
  });

  it("step — 작업 대상 티켓에 단계를 매기고, 매긴 값을 말한다", () => {
    activate(dataDir, slug(), "f");
    expect(stepText([slug(), "f/01-a", "1"], dataDir, proj)).toBe("f/01-a → 1단계");
    expect(readSteps(dataDir, slug())).toContainEqual({ feature: "f", ticket: "01-a", step: 1 });
  });

  it("step — 두 번째 매김이 이긴다(덮어쓰기)", () => {
    activate(dataDir, slug(), "f");
    stepText([slug(), "f/01-a", "9999"], dataDir, proj);
    stepText([slug(), "f/01-a", "1"], dataDir, proj);
    expect(readSteps(dataDir, slug())).toEqual([{ feature: "f", ticket: "01-a", step: 1 }]);
  });

  it("step --clear — 단계를 뗀다", () => {
    activate(dataDir, slug(), "f");
    stepText([slug(), "f/01-a", "1"], dataDir, proj);
    expect(stepClearText([slug(), "f/01-a"], dataDir, proj)).toContain("뗐다");
    expect(readSteps(dataDir, slug())).toEqual([]);
  });

  it("step --clear — 없는 행을 떼도 조용히 끝난다(멱등)", () => {
    expect(() => stepClearText([slug(), "f/01-a"], dataDir, proj)).not.toThrow();
  });

  it("어떤 명령으로도 카드의 자리나 순서를 바꿀 수 없다 — `area`·`seq` CLI 가 없다", () => {
    // step·step --clear·board·next 넷 중 자리를 옮기는 것은 하나도 없다 — 배선 자체가 증거다.
    expect(Object.keys({ stepText, stepClearText, boardText, nextText })).toEqual([
      "stepText",
      "stepClearText",
      "boardText",
      "nextText",
    ]);
  });

  it("board — 다섯 칸과 작업 대상 티켓의 표시 단계를 읽는다(읽기 전용)", () => {
    activate(dataDir, slug(), "f");
    stepText([slug(), "f/01-a", "1"], dataDir, proj);
    stepText([slug(), "f/02-b", "9999"], dataDir, proj);
    const out = boardText([slug()], dataDir, proj);
    expect(out).toContain("## 작업 대상 (1)");
    expect(out).toContain("[1] 01-a a");
    expect(out).toContain("[9999] 02-b b");
  });

  it("board — 🔴 어떤 플래그도 받지 않는다", () => {
    expect(() => boardText([slug(), "--why"], dataDir, proj)).toThrow(/받지 않는다/);
  });

  it("next — 프로젝트 없이 거절한다", () => {
    expect(() => nextText([], dataDir, proj)).toThrow(CliError);
  });

  it("next — 🔴 --why 를 받지 않는다", () => {
    expect(() => nextText([slug(), "--why", "이유"], dataDir, proj)).toThrow(/받지 않는다/);
  });

  it("next — 작업 대상이 비어 있으면 1단계가 없다고 말한다", () => {
    expect(nextText([slug()], dataDir, proj)).toBe("(1단계 없음)");
  });

  it("next — 🔴 작업 대상의 표시 1단계만 말한다 — board 와 같은 함수를 쓴다", () => {
    activate(dataDir, slug(), "f");
    stepText([slug(), "f/01-a", "1"], dataDir, proj);
    stepText([slug(), "f/02-b", "9999"], dataDir, proj);
    expect(nextText([slug()], dataDir, proj)).toBe("f/01-a\ta");
  });
});
