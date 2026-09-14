import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, it, expect } from "vitest";
import {
  appendMemo,
  centralMemosFile,
  discoverProjects,
  memosFile,
  readMemos,
  readPlacements,
  readSteps,
  upsertTicketRecord,
  writeMemoFile,
  writePlanMove,
  writeSettings,
} from "@gootte/core-io";
import type { Memo } from "@gootte/contract";
import { CliError } from "./args";

import { boardText, discoverText, frontierText, memoMigrateText, memoText, nextText, pendingText, resolveProjectPath, stepClearText, stepText, workingText } from "./commands";

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

  /**
   * 🔴 T01 — 같은 slug 의 사본은 하나로 묶는다. 단일 사본은 기존 줄(`slug\tpath`) 그대로,
   * 사본이 둘 이상이면 개수를 덧붙인다. 단일 줄은 수용 기준 3(한 글자도 안 바뀜)을 만족.
   */
  it("discover — 사본이 둘 이상이면 개수를 덧붙이고, 단일은 기존 줄 그대로", () => {
    const root = mkdtempSync(join(tmpdir(), "gootte-disc-root-"));
    const a = join(root, "dup");
    const bRoot = mkdtempSync(join(tmpdir(), "gootte-disc-b-"));
    const b = join(bRoot, "dup");
    for (const d of [a, b]) {
      w(d, "AGENTS.md", "# AGENTS\n");
      w(d, "docs/features/f/issues/01-x.md", "# 01 — x\n\n**Status:** ready-for-agent\n");
    }
    const solo = mkdtempSync(join(tmpdir(), "gootte-disc-solo-"));
    w(solo, "AGENTS.md", "# AGENTS\n");
    w(solo, "docs/features/f/issues/01-x.md", "# 01 — x\n\n**Status:** ready-for-agent\n");
    try {
      expect(discoverText([root, bRoot])).toBe(`dup\t${a}\t(2 copies)`);
      // 단일 사본은 기존 줄(`slug\tpath`) 그대로 — 한 글자도 안 바뀜(수용 기준 3).
      expect(discoverText([solo])).toBe(`${basename(solo)}\t${solo}`);
    } finally {
      for (const d of [root, bRoot, solo]) rmSync(d, { recursive: true, force: true });
    }
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

  it("step — 🔴 신관례(tickets/) 티켓에도 단계를 매긴다 — 존재 판정이 두 관례를 합쳐 본다(실제 결함)", () => {
    w(proj, "docs/features/g/tickets/T01.md", "# T01 — c\n\n## Depends on\n- nothing\n");
    activate(dataDir, slug(), "g");
    expect(stepText([slug(), "g/T01", "1"], dataDir, proj)).toBe("g/T01 → 1단계");
    expect(readSteps(dataDir, slug())).toContainEqual({ feature: "g", ticket: "T01", step: 1 });
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

  it("board — 🔴 신관례(tickets/) 티켓도 작업 대상 줄에 나온다 — 출력이 두 관례를 합쳐 읽는다(실제 결함)", () => {
    w(proj, "docs/features/g/tickets/T01.md", "# T01 — c\n\n## Depends on\n- nothing\n");
    activate(dataDir, slug(), "g");
    stepText([slug(), "g/T01", "2"], dataDir, proj);
    const out = boardText([slug()], dataDir, proj);
    // 신관례 전용 기능 g 가 작업 대상에 뜨고, 그 티켓 줄도 매겨진 단계와 함께 나온다.
    expect(out).toContain("## 작업 대상 (1)");
    expect(out).toContain("- g");
    expect(out).toMatch(/\[\d+\] T01 c/);
  });

  it("board — 🔴 어떤 플래그도 받지 않는다", () => {
    expect(() => boardText([slug(), "--why"], dataDir, proj)).toThrow(/받지 않는다/);
  });

  /**
   * 실측 장면(gootte-card-close-cli) 회귀 — 04 의 자동 닫힘이 HTTP `readBoard` 뿐 아니라 CLI 도
   * 지난다. HTTP 를 **한 번도 부르지 않고** `boardText` 만으로 다 끝난 카드가 완료 칸에 보이고,
   * 계획 DB 에도 실제로 닫힘이 남는다(이 갈래는 "닫힘 쓰기를 CLI 경로에도 태운다" 쪽을 골랐다).
   */
  it("board — 🔴 HTTP 를 부르지 않아도 티켓이 전부 완료된 기능은 완료 칸으로 넘어간다", () => {
    w(
      proj,
      "docs/features/done-feature/issues/01-x.md",
      "# 01 — x\n\n**Status:** resolved (2026-08-01)\n\n**Blocked by:** 없음\n",
    );
    activate(dataDir, slug(), "done-feature");

    const out = boardText([slug()], dataDir, proj);
    expect(out).toContain("## 완료 (1)");
    expect(out).toContain("- done-feature");
    expect(out).not.toContain("## 작업 대상 (1)");

    // 화면(HTTP)을 켜지 않아도 계획 DB 에 닫힘이 실제로 남는다 — CLI 만 쓰는 세션이 같은 판을 본다.
    expect(readPlacements(dataDir, slug())).toContainEqual({
      feature: "done-feature",
      area: "done",
      seq: 0,
      closedAt: null,
    });
  });

  it("board — 아직 안 끝난 기능은 CLI 로도 닫히지 않는다", () => {
    activate(dataDir, slug(), "f");
    const out = boardText([slug()], dataDir, proj);
    expect(out).toContain("## 작업 대상 (1)");
    expect(out).not.toContain("## 완료 (1)");
  });

  /**
   * T03 — 갈라진 사본은 조용히 고르지 않고 화면이 말한다. CLI 도 같은 사실을 한 줄로 낸다
   * (the-terminal-agrees-with-the-screen 의 규율, AC4). 실물 git 저장소 두 벌로 진짜 갈라짐을
   * 만든다(T02 의 픽스처 규율과 같다 — 지어낸 git 출력을 쓰지 않는다).
   */
  it("board — 🔴 갈라진 사본은 조용히 고르지 않고 CLI 도 그 사실을 한 줄로 낸다(T03)", () => {
    const root = mkdtempSync(join(tmpdir(), "gootte-conflict-root-"));
    const a = join(root, "conflict-proj");
    const bRoot = mkdtempSync(join(tmpdir(), "gootte-conflict-b-"));
    const b = join(bRoot, "conflict-proj");
    const initRepo = (dir: string): void => {
      mkdirSync(dir, { recursive: true });
      execFileSync("git", ["init", "-q", dir], { stdio: "ignore" });
      execFileSync("git", ["-C", dir, "config", "user.email", "crew@example.com"], { stdio: "ignore" });
      execFileSync("git", ["-C", dir, "config", "user.name", "crew"], { stdio: "ignore" });
      execFileSync("git", ["-C", dir, "config", "commit.gpgsign", "false"], { stdio: "ignore" });
      execFileSync("git", ["-C", dir, "symbolic-ref", "HEAD", "refs/heads/main"], { stdio: "ignore" });
    };
    const commit = (dir: string, msg: string): void => {
      execFileSync("git", ["-C", dir, "add", "-A"], { stdio: "ignore" });
      execFileSync("git", ["-C", dir, "commit", "-q", "-m", msg], { stdio: "ignore" });
    };
    try {
      initRepo(a);
      w(a, "AGENTS.md", "# AGENTS\n");
      w(a, "docs/features/f/spec.md", "# f\n\nStatus: draft\n");
      commit(a, "a");
      execFileSync("git", ["clone", "-q", a, b], { stdio: "ignore" });
      // 양쪽 다 독립 커밋 — 조상 관계가 어느 쪽으로도 성립하지 않는다(진짜 갈라짐).
      w(a, "docs/features/f/spec.md", "# f — A 쪽\n\nStatus: draft\n");
      commit(a, "a2");
      w(b, "docs/features/f/spec.md", "# f — B 쪽\n\nStatus: draft\n");
      commit(b, "b2");

      const out = boardText(["conflict-proj"], dataDir, root);
      const prevRoots = process.env.GOOTTE_ROOTS;
      process.env.GOOTTE_ROOTS = `${root}:${bRoot}`;
      let out2: string;
      try {
        out2 = boardText(["conflict-proj"], dataDir, root);
      } finally {
        if (prevRoots === undefined) delete process.env.GOOTTE_ROOTS;
        else process.env.GOOTTE_ROOTS = prevRoots;
      }
      // 뿌리 하나만 주면 사본이 하나뿐이라 갈라질 일이 없다 — 대조군(회귀 방지).
      expect(out).not.toContain("갈라짐");
      // 두 사본을 다 보게 해도 갈라짐 표시는 더 이상 응답에 없다(conflict 속성 제거).
      expect(out2).not.toContain("갈라짐");
    } finally {
      for (const d of [root, bRoot]) rmSync(d, { recursive: true, force: true });
    }
  });

  /**
   * plan-board/11 — HTTP 를 한 번도 부르지 않아도 예약 칸의 카드가 안 읽은 티켓 때문에 대기로
   * 올라온다(spec §화면을 안 켜도 같다). `board` 는 `readPlacementsWithAutoClose`(core-io) 하나를
   * 화면과 같이 지나므로, 이 판정도 CLI 만으로 같은 결과를 낸다.
   */
  it("board — 🔴 HTTP 를 부르지 않아도 예약 칸의 카드는 안 읽은 티켓이 생기면 대기로 올라온다", () => {
    writePlanMove(dataDir, slug(), {
      upsert: [{ feature: "f", area: "reserved", seq: 0, closedAt: null }],
      remove: [],
      clearSteps: [],
      setSteps: [],
    });
    // 있던 티켓 둘을 읽음으로 깐다(첫 화면 깔기).
    boardText([slug()], dataDir, proj);
    expect(boardText([slug()], dataDir, proj)).toContain("## 예약 (1)");

    // 안 읽은 새 티켓이 생긴다.
    w(
      proj,
      "docs/features/f/issues/03-late.md",
      "# 03 — late\n\n**Status:** ready-for-agent\n\n**Blocked by:** 없음\n",
    );
    const out = boardText([slug()], dataDir, proj);
    expect(out).toContain("## 대기 (1)");
    expect(out).not.toContain("## 예약 (1)");
    // 계획 DB 에도 실제로 자리 행이 사라졌다 — CLI 만 쓰는 세션이 같은 판을 본다.
    expect(readPlacements(dataDir, slug())).toEqual([]);
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

  it("next — 🔴 캡틴 눈이 걸린 티켓은 👁 를 싣는다 — 받는 쪽이 티켓 파일을 다시 안 연다(INV-E1)", () => {
    w(
      proj,
      "docs/features/f/issues/01-a.md",
      "# 01 — a\n\n**Status:** ready-for-agent\n\n**Blocked by:** 없음\n\n## 캡틴 확인\n\n- 어디서\n",
    );
    activate(dataDir, slug(), "f");
    stepText([slug(), "f/01-a", "1"], dataDir, proj);
    expect(nextText([slug()], dataDir, proj)).toBe("f/01-a\ta 👁");
  });
});

/**
 * 상태 확정(the-terminal-agrees-with-the-screen T01) — CLI `board`·`next` 가 화면과 **같은**
 * 판정 자리(`finalizeFeatureStatus`)를 지나는가. 신관례(`tickets/T<NN>.md`) 티켓의 상태 단일 출처는
 * 티켓 문서의 `Time:` 줄이다 — 확정 없이 CLI 는 이미 끝난 티켓을 미완료로 보고 next 가 다시 내놓는다(spec §문제).
 */
describe("cli — board·next 에 상태 확정(T01)", () => {
  let proj: string;
  let dataDir: string;

  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), "gootte-backlog-proj-"));
    dataDir = mkdtempSync(join(tmpdir(), "gootte-backlog-db-"));
    w(proj, "AGENTS.md", "# AGENTS\n");
    // T04 — 신관례 티켓은 Time: 줄로 상태 판정. T01은 finishedAt 있음(done), T02는 없음(pending)
    w(proj, "docs/features/g/tickets/T01.md", "# T01 — c\n\n## Depends on\n- nothing\n\n**Time:** started=2026-08-25T14:00:00+09:00 finished=2026-08-25T15:00:00+09:00\n");
    w(proj, "docs/features/g/tickets/T02.md", "# T02 — d\n\n## Depends on\n- nothing\n");
    activate(dataDir, slug(), "g");
    writeSettings(dataDir, {});
  });
  afterEach(() => {
    for (const p of [proj, dataDir]) rmSync(p, { recursive: true, force: true });
  });

  const slug = () => basename(proj);

  it("next — 🔴 Time: 줄에 finishedAt 있는 신관례 티켓을 내보내지 않는다", () => {
    stepText([slug(), "g/T01", "1"], dataDir, proj);
    stepText([slug(), "g/T02", "2"], dataDir, proj);
    // T01 에는 finishedAt 이 있으므로 done 으로 판정 — next 에서 제외된다.
    expect(nextText([slug()], dataDir, proj)).toBe("g/T02\td");
  });

  it("board — 🔴 전부 끝난(Time: finishedAt) 신관례 기능은 완료 칸으로 넘어간다(자동 닫힘 같은 자리)", () => {
    // T02 에도 finishedAt 을 넣어 done 으로 만든다.
    w(proj, "docs/features/g/tickets/T02.md", "# T02 — d\n\n## Depends on\n- nothing\n\n**Time:** started=2026-08-25T14:00:00+09:00 finished=2026-08-25T15:00:00+09:00\n");
    const out = boardText([slug()], dataDir, proj);
    expect(out).toContain("## 완료 (1)");
    expect(out).toContain("- g");
    expect(out).not.toContain("## 작업 대상 (1)");
    // 화면 없이도 계획 DB 에 닫힘이 남는다 — CLI 만 쓰는 세션이 같은 판을 본다.
    expect(readPlacements(dataDir, slug())).toContainEqual({
      feature: "g",
      area: "done",
      seq: 0,
      closedAt: null,
    });
  });

  it("설정 파일 없음 — 명령이 죽지 않는다(INV-U1)", () => {
    const bareDataDir = mkdtempSync(join(tmpdir(), "gootte-bare-db-"));
    try {
      activate(bareDataDir, slug(), "g");
      stepText([slug(), "g/T01", "1"], bareDataDir, proj);
      stepText([slug(), "g/T02", "2"], bareDataDir, proj);
      // 🔴 T04 — 티켓 문서의 Time: 줄(finishedAt)이 SoT라 T01 은 여전히 done 이다. 명령도 안 죽는다.
      expect(nextText([slug()], bareDataDir, proj)).toBe("g/T02\td");
    } finally {
      rmSync(bareDataDir, { recursive: true, force: true });
    }
  });
});

/**
 * GOOTTE_ROOTS(the-terminal-agrees-with-the-screen T02) — `resolveProjectPath` 가 백엔드
 * `effectiveRoots` 와 같은 규약(core-io `effectiveProjectRoots`)으로 뿌리를 정하는가.
 */
describe("cli — resolveProjectPath 는 GOOTTE_ROOTS 도 본다(T02)", () => {
  function projectAt(dir: string): string {
    mkdirSync(join(dir, "docs", "features"), { recursive: true });
    writeFileSync(join(dir, "AGENTS.md"), "# AGENTS\n");
    return dir;
  }

  function withEnv<T>(value: string | undefined, fn: () => T): T {
    const prev = process.env.GOOTTE_ROOTS;
    if (value === undefined) delete process.env.GOOTTE_ROOTS;
    else process.env.GOOTTE_ROOTS = value;
    try {
      return fn();
    } finally {
      if (prev === undefined) delete process.env.GOOTTE_ROOTS;
      else process.env.GOOTTE_ROOTS = prev;
    }
  }

  it("env 뿌리에서 프로젝트를 찾는다 — cwd 에 없어도", () => {
    const root = mkdtempSync(join(tmpdir(), "gootte-roots-a-"));
    const p = projectAt(join(root, "proj-a"));
    try {
      withEnv(root, () => {
        expect(resolveProjectPath("proj-a", "/nonexistent-cwd")).toBe(p);
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("콜론 구분 여러 뿌리 — 두 번째 뿌리의 프로젝트도 찾는다", () => {
    const rootA = mkdtempSync(join(tmpdir(), "gootte-roots-b1-"));
    const rootB = mkdtempSync(join(tmpdir(), "gootte-roots-b2-"));
    const p = projectAt(join(rootB, "proj-b"));
    try {
      withEnv(`${rootA}:${rootB}`, () => {
        expect(resolveProjectPath("proj-b", "/nonexistent-cwd")).toBe(p);
      });
    } finally {
      rmSync(rootA, { recursive: true, force: true });
      rmSync(rootB, { recursive: true, force: true });
    }
  });

  it("env 가 없으면 기존과 같다 — cwd 최우선은 기존 시험 전체가 증거", () => {
    withEnv(undefined, () => {
      expect(resolveProjectPath("ghost-proj-nowhere", "/nonexistent-cwd")).toBeNull();
    });
  });
});

describe("cli — working · pending(처리중·대기 티켓 목록, 캡틴 지시 2026-09-09)", () => {
  let proj: string;
  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), "gootte-wp-"));
    w(proj, "AGENTS.md", "# AGENTS\n");
    w(proj, "docs/features/alpha/tickets/T01.md", "# T01 — 시작함\n");
    w(proj, "docs/features/alpha/tickets/T02.md", "# T02 — 안 함\n");
    w(proj, "docs/features/alpha/tickets/T03.md", "# T03 — 끝남\n");
    w(proj, "docs/features/beta/tickets/T01.md", "# B01 — 폐기\n");
  });
  afterEach(() => rmSync(proj, { recursive: true, force: true }));

  const slug = () => basename(proj);

  it("처리중 — started 만 있는 레코드(진행 중)만 실린다", () => {
    upsertTicketRecord(proj, "alpha/T01", { startedAt: "2026-09-09T09:00:00+09:00", finishedAt: null });
    upsertTicketRecord(proj, "alpha/T03", { startedAt: "2026-09-09T09:00:00+09:00", finishedAt: "2026-09-09T10:00:00+09:00" });
    upsertTicketRecord(proj, "beta/T01", { startedAt: null, finishedAt: null, statusRaw: "wontfix (2026-09-01)" });
    expect(workingText([slug()], undefined, proj)).toBe("alpha\tT01");
  });

  it("대기 — 레코드 없는 티켓(미시작)이 실린다. done·dropped·처리중은 아니다", () => {
    upsertTicketRecord(proj, "alpha/T01", { startedAt: "2026-09-09T09:00:00+09:00", finishedAt: null });
    upsertTicketRecord(proj, "alpha/T03", { startedAt: "2026-09-09T09:00:00+09:00", finishedAt: "2026-09-09T10:00:00+09:00" });
    upsertTicketRecord(proj, "beta/T01", { startedAt: null, finishedAt: null, statusRaw: "wontfix (2026-09-01)" });
    expect(pendingText([slug()], undefined, proj)).toBe("alpha\tT02");
  });

  it("줄 서식 — <기능-slug>\\t<티켓>(캡틴이 정한 형식)", () => {
    upsertTicketRecord(proj, "alpha/T01", { startedAt: "2026-09-09T09:00:00+09:00", finishedAt: null });
    upsertTicketRecord(proj, "beta/T02", { startedAt: "2026-09-09T09:00:00+09:00", finishedAt: null });
    w(proj, "docs/features/beta/tickets/T02.md", "# B02\n");
    expect(workingText([slug()], undefined, proj)).toBe("alpha\tT01\nbeta\tT02");
  });

  it("프로젝트 밖에서 인자 생략하면 거절 — 안에서는 생략 가능(캡틴 지시 2026-09-09)", () => {
    // cwd = 임시 프로젝트 안 → 유추 성공. 프로젝트 밖 cwd 를 주면 거절한다.
    expect(() => workingText([], undefined, join(proj, "docs", "features"))).not.toThrow(); // 안
    expect(() => workingText([], undefined, "/")).toThrow(CliError); // 밖
  });

  it("MD 모드(레코드 없는 프로젝트)에서도 MD Time 줄 기준으로 읽는다 — 폴백 회귀", () => {
    // 🔴 처리중은 Time 기록에서만 나온다 — `Status: claimed` 은 pending 사상(계약 Q3)이라
    // 이 목록에 실리지 않는다. started= 만 있고 finished= 가 없으면 in_progress 이다.
    w(proj, "docs/features/gamma/tickets/T01.md", "# G01\n\n**Time:** started=2026-09-09T09:00:00+09:00\n");
    expect(workingText([slug()], undefined, proj)).toBe("gamma\tT01");
  });
});

describe("cli — frontier(착수 가능 티켓 목록)", () => {
  let proj: string;
  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), "gootte-fr-"));
    w(proj, "AGENTS.md", "# AGENTS\n");
    w(proj, "docs/features/alpha/tickets/T01.md", "# 시작함\n");
    w(proj, "docs/features/alpha/tickets/T02.md", "# 대기중\n");
    w(proj, "docs/features/alpha/tickets/T03.md", "# 끝남\n");
    w(proj, "docs/features/beta/tickets/T01.md", "# 폐기\n");
  });
  afterEach(() => rmSync(proj, { recursive: true, force: true }));

  const slug = () => basename(proj);

  it("대기+차단 없음만 제목과 함께 실린다 — 처리중·완료·폐기는 아니다", () => {
    upsertTicketRecord(proj, "alpha/T01", { startedAt: "2026-09-09T09:00:00+09:00", finishedAt: null });
    upsertTicketRecord(proj, "alpha/T03", { startedAt: "2026-09-09T09:00:00+09:00", finishedAt: "2026-09-09T10:00:00+09:00" });
    upsertTicketRecord(proj, "beta/T01", { startedAt: null, finishedAt: null, statusRaw: "wontfix (2026-09-01)" });
    expect(frontierText([slug()], undefined, proj)).toBe("alpha\tT02\t대기중");
  });

  it("`Blocked by:` 줄이 있는 티켓은 막히고, 줄 없는 옛 포맷은 차단 없음으로 실린다", () => {
    w(proj, "docs/features/gamma/tickets/T01.md", "# 막힘\n\n**Blocked by:** T02\n");
    w(proj, "docs/features/gamma/tickets/T02.md", "# 열림\n");
    const lines = frontierText([slug()], undefined, proj).split("\n");
    expect(lines).toContain("gamma\tT02\t열림");
    expect(lines.some((l) => l.startsWith("gamma\tT01\t"))).toBe(false);
  });

  it("레코드로 완료된 선행은 신관례 티켓을 해제한다 — 확정 뒤 재판정 회귀", () => {
    // an-fsm-can-hold-other-fsms/T10 실측: MD 파싱 시점엔 선행이 전부 pending 이라 막혀 보이지만,
    // v2 레코드로 끝나면 frontier 에 들어와야 한다(INV-3).
    w(proj, "docs/features/gamma/tickets/T01.md", "# 막힘\n\n**Blocked by:** T02\n");
    w(proj, "docs/features/gamma/tickets/T02.md", "# 열림\n");
    upsertTicketRecord(proj, "gamma/T02", { startedAt: "2026-09-09T09:00:00+09:00", finishedAt: "2026-09-09T10:00:00+09:00" });
    const lines = frontierText([slug()], undefined, proj).split("\n");
    expect(lines).toContain("gamma\tT01\t막힘");
  });

  it("없으면 안내 문구", () => {
    upsertTicketRecord(proj, "alpha/T01", { startedAt: "2026-09-09T09:00:00+09:00", finishedAt: "2026-09-09T10:00:00+09:00" });
    upsertTicketRecord(proj, "alpha/T02", { startedAt: "2026-09-09T09:00:00+09:00", finishedAt: "2026-09-09T10:00:00+09:00" });
    upsertTicketRecord(proj, "alpha/T03", { startedAt: "2026-09-09T09:00:00+09:00", finishedAt: "2026-09-09T10:00:00+09:00" });
    upsertTicketRecord(proj, "beta/T01", { startedAt: null, finishedAt: null, statusRaw: "wontfix (2026-09-01)" });
    expect(frontierText([slug()], undefined, proj)).toBe("(착수 가능 티켓 없음)");
  });

  it("프로젝트 안에서는 인자 생략 가능 — 밖에서는 거절(resolveProjectArg 공용)", () => {
    expect(() => frontierText([], undefined, join(proj, "docs", "features"))).not.toThrow();
    expect(() => frontierText([], undefined, "/")).toThrow(CliError);
  });
});


/**
 * `gootte memo` 읽기 — 좌표가 **`<메인 프로젝트>/.gootte/memo.json`** 이다
 * (memos-live-with-the-project/T02, memos-read-from-any-session/T01 의 서식·필터 규약 승계).
 *
 * 🔴 두 얼굴을 같이 잰다:
 *   - **폴백 없음** — central 에 데이터가 있어도 0건 + `메모 없음` 이 올바른 답이다(AC3).
 *     반대로 읽으면 그 순간 이중 원장이고, 미이관 프로젝트가 이관된 척 보인다.
 *   - **읽기가 만들지 않는다** — 빈 목록을 읽는 실행이 `.gootte/` 를 더럽히면 안 된다(Locked 3).
 * 출력 서식(헤더·들여쓰기·필터 문구)은 이 표에서 바꾸지 않는다(grill Locked 7).
 */
describe("cli — memo(메모를 프로젝트 파일에서 읽는다, T02)", () => {
  let proj: string;
  let dataDir: string; // central 의 부모 — 여기 심은 것은 **보이면 안 된다**
  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), "gootte-memo-proj-"));
    dataDir = mkdtempSync(join(tmpdir(), "gootte-memo-data-"));
    // 발견 표식(AGENTS.md + docs/features/) — slug 유추는 이 둘로만 정해진다(캡틴 지시 2026-09-09).
    w(proj, "AGENTS.md", "# AGENTS\n");
    w(proj, "docs/features/alpha/tickets/T01.md", "# T01\n");
  });
  afterEach(() => {
    rmSync(proj, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  });

  const slug = () => basename(proj);
  /** 저장 순서 = 작성 순서 — 화면과 같은 자리(`appendMemo`)로, **프로젝트 좌표에** 심는다. */
  const seed = (content: string, createdAt: string, done = false): void => {
    appendMemo(proj, { content, done }, createdAt);
  };
  const heads = (text: string): string[] => text.split("\n").filter((l) => l.startsWith("- ["));

  it("AC1 전체 — 헤더 + 항목, 완료·미완료 섞임, 최신먼저", () => {
    seed("가장 오래된 미완료", "2026-09-01T00:00:00.000Z");
    seed("중간 완료", "2026-09-02T00:00:00.000Z", true);
    seed("가장 최신 미완료", "2026-09-03T00:00:00.000Z");
    expect(memoText([], proj)).toBe(
      [
        `== ${slug()} · 메모 3건 (완료 1 · 미완료 2) ==`,
        "- [ ] 2026-09-03 가장 최신 미완료",
        "- [x] 2026-09-02 중간 완료",
        "- [ ] 2026-09-01 가장 오래된 미완료",
      ].join("\n"),
    );
  });

  it("AC2 --undone — 미완료 항목만. 헤더 카운트는 전체 유지 + `· 필터: undone`", () => {
    seed("오래된 미완료", "2026-09-01T00:00:00.000Z");
    seed("완료", "2026-09-02T00:00:00.000Z", true);
    seed("최신 미완료", "2026-09-03T00:00:00.000Z");
    const out = memoText(["--undone"], proj);
    expect(out.split("\n")[0]).toBe(`== ${slug()} · 메모 3건 (완료 1 · 미완료 2) · 필터: undone ==`);
    expect(heads(out)).toEqual(["- [ ] 2026-09-03 최신 미완료", "- [ ] 2026-09-01 오래된 미완료"]);
  });

  it("AC3 --done — 완료 항목만", () => {
    seed("미완료", "2026-09-01T00:00:00.000Z");
    seed("완료", "2026-09-02T00:00:00.000Z", true);
    const out = memoText(["--done"], proj);
    expect(heads(out)).toEqual(["- [x] 2026-09-02 완료"]);
    expect(out).toContain("· 필터: done ==");
  });

  it("AC4 프로젝트 인자는 사용자 오류로 멈춘다 — 다른 프로젝트로 읽히지 않는다", () => {
    seed("내 메모", "2026-09-01T00:00:00.000Z");
    // 남의 slug 를 줘도 그 프로젝트의 파일을 열지 않는다 — 조용히 무시도 하지 않는다.
    expect(() => memoText(["jinwooauto"], proj)).toThrow(CliError);
    expect(() => memoText(["jinwooauto"], proj)).toThrow(/프로젝트 인자를 받지 않는다/);
    seed("내 메모 둘", "2026-09-02T00:00:00.000Z", true);
    expect(memoText([], proj)).toContain("메모 2건");
  });

  it("AC4 다른 프로젝트 cwd 는 자기 메모만 — 전체 조회로 새지 않는다", () => {
    const other = mkdtempSync(join(tmpdir(), "gootte-memo-other-"));
    try {
      w(other, "AGENTS.md", "# AGENTS\n");
      w(other, "docs/features/beta/tickets/T01.md", "# T01\n");
      appendMemo(proj, { content: "이쪽 생각" }, "2026-09-01T00:00:00.000Z");
      appendMemo(other, { content: "저쪽 생각" }, "2026-09-02T00:00:00.000Z");
      const mine = memoText([], proj);
      const theirs = memoText([], other);
      expect(mine).toContain("이쪽 생각");
      expect(mine).not.toContain("저쪽 생각");
      expect(theirs).toContain(`== ${basename(other)} · 메모 1건`);
      expect(theirs).toContain("저쪽 생각");
      expect(theirs).not.toContain("이쪽 생각");
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("AC5 메모 파일이 없다 → `메모 없음` 한 줄, 던지지 않는다(지운 것과 고장은 다르다)", () => {
    expect(memoText([], proj)).toBe(`== ${slug()} · 메모 없음 ==`);
    expect(memoText(["--undone"], proj)).toBe(`== ${slug()} · 메모 없음 ==`);
  });

  it("🔴 AC3 폴백 없음 — central 에만 데이터가 있는 미이관 프로젝트는 **0건 + 메모 없음** 이 옳다", () => {
    // 같은 slug 로 central 에 원장이 남아 있어도(이관 전 상태) 읽기는 거기를 지나지 않는다.
    writeMemoFile(centralMemosFile(dataDir, slug()), [
      { id: "1-1", content: "중앙에만 남아 있는 생각", done: false, createdAt: "2026-09-01", updatedAt: "2026-09-01" },
    ]);
    expect(memoText([], proj)).toBe(`== ${slug()} · 메모 없음 ==`);
    // central 을 읽은 흔적(쓰기)도 없다 — 읽기는 어디에도 손대지 않는다.
    expect(JSON.parse(readFileSync(centralMemosFile(dataDir, slug()), "utf8"))).toHaveLength(1);
  });

  it("🔴 Locked 3 — 빈 목록을 읽는 실행이 `.gootte/` 를 **만들지 않는다**", () => {
    expect(existsSync(join(proj, ".gootte"))).toBe(false);
    expect(memoText([], proj)).toContain("메모 없음");
    expect(existsSync(join(proj, ".gootte"))).toBe(false);
    // 깊은 하위 경로에서 돌아도 마찬가지다 — 읽기는 어디서도 디렉토리를 만들지 않는다.
    expect(memoText([], join(proj, "docs", "features"))).toContain("메모 없음");
    expect(existsSync(join(proj, ".gootte"))).toBe(false);
  });

  it("🔴 회귀 가드 — worktree 사본 cwd 에서 읽어도 **메인 사본** 답이다(이관 원장 두 짝 금지)", () => {
    // 실물 git worktree 를 **다른 basename** 으로 만든다 — 첫 칸에 `<메인>` 이 아니라
    // 격리 사본 이름이 걸리면 그 자체가 이중 원장의 얼굴이다(INV-1).
    const wtParent = mkdtempSync(join(tmpdir(), "gootte-memo-wt-"));
    const wt = join(wtParent, "feature-x");
    const git = (args: string[]): void => {
      execFileSync("git", ["-C", proj, ...args], { stdio: "ignore" });
    };
    try {
      git(["init", "-q"]);
      git(["config", "user.email", "crew@example.com"]);
      git(["config", "user.name", "crew"]);
      git(["config", "commit.gpgsign", "false"]);
      git(["symbolic-ref", "HEAD", "refs/heads/main"]);
      git(["add", "-A"]);
      git(["commit", "-q", "-m", "seed"]);
      git(["worktree", "add", "-q", "-b", "memo-wt", wt]);
      // 전제: 사본의 `.git` 은 디렉토리가 아니라 gitdir 포인터다(= 메인 승격이 실제로 필요한 자리).
      expect(readFileSync(join(wt, ".git"), "utf8")).toMatch(/^gitdir:/);
      // config.json 을 사본에 심지 않는다 — git 추론만으로 메인에 닿는지(읽기는 아무것도 만들지 않는다).
      expect(existsSync(join(wt, ".gootte", "config.json"))).toBe(false);

      seed("메인 사본에 적힌 메모", "2026-09-01T00:00:00.000Z");
      const fromMain = memoText([], proj);
      const fromWorktree = memoText([], wt);
      // 헤더 slug 는 **메인의 것** — 격리 사본 디렉토리 이름이 뜨면 그 순간 갈라진 원장이다.
      expect(fromWorktree).toBe(fromMain);
      expect(fromWorktree.split("\n")[0]).toBe(`== ${slug()} · 메모 1건 (완료 0 · 미완료 1) ==`);
      expect(fromWorktree).toContain("메인 사본에 적힌 메모");
      // 하위 경로에서 쳐도 같다.
      expect(memoText([], join(wt, "docs", "features"))).toBe(fromMain);
      // 사본 쪽에는 아무것도 생기지 않았다(읽기도 승격도 파일을 만들지 않는다 — Locked 3).
      expect(existsSync(join(wt, ".gootte"))).toBe(false);
    } finally {
      rmSync(wtParent, { recursive: true, force: true });
    }
  });

  it("AC6 --done --undone 는 0 건이 아니라 오류로 끝난다", () => {
    seed("메모", "2026-09-01T00:00:00.000Z");
    expect(() => memoText(["--done", "--undone"], proj)).toThrow(CliError);
    expect(() => memoText(["--done", "--undone"], proj)).toThrow(/--done 과 --undone 을 같이 쓸 수 없다/);
  });

  it("모르는 플래그도 사용자 오류 — 조용히 무시하지 않는다", () => {
    expect(() => memoText(["--all"], proj)).toThrow(/--all 는 받지 않는다/);
  });

  it("AC7 다중 줄 메모는 출력에서 하나의 항목으로 붙는다(들여쓰기 규약)", () => {
    seed("첫 줄\n둘째 줄 verbatim\n셋째 줄", "2026-09-10T00:00:00.000Z");
    const out = memoText([], proj);
    expect(out.split("\n")).toEqual([
      `== ${slug()} · 메모 1건 (완료 0 · 미완료 1) ==`,
      "- [ ] 2026-09-10 첫 줄",
      "    둘째 줄 verbatim",
      "    셋째 줄",
    ]);
    expect(heads(out)).toHaveLength(1);
  });

  it("손상 JSON 은 exit 1 + 원인 — 빈 목록·`메모 없음` 과 구별된다", () => {
    seed("정상 메모", "2026-09-01T00:00:00.000Z");
    writeFileSync(memosFile(proj), "{ not json");
    let err: unknown;
    try {
      memoText([], proj);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(CliError);
    const msg = (err as Error).message;
    expect(msg).toContain("원인");
    expect(msg).toContain(memosFile(proj)); // 어디서 못 읽었는지 — 새 좌표가 printed 된다
    expect(msg).not.toContain("메모 없음");
  });

  it("프로젝트 안 어디서 쳐도 같은 답, 밖에서는 안내와 함께 거절(slugFromCwd)", () => {
    seed("메모", "2026-09-01T00:00:00.000Z");
    expect(memoText([], join(proj, "code", "web"))).toBe(memoText([], proj));
    expect(() => memoText([], "/")).toThrow(/\(프로젝트 안에서 실행하면 인자를 생략할 수 있다\)/);
  });
});

/**
 * `memo migrate` — central `~/.gootte/memos/<slug>.json` → `<메인 프로젝트>/.gootte/memo.json`
 * (memos-live-with-the-project/T01). 이관 절차 자체는 T01 그대로이고, T02 가 읽기 경로를 돌렸다.
 *
 * 🔴 그래서 이 표의 마지막 가드가 **뒤집혔다**(T02 가 반대로 뒤집겠다고 예고한 바로 그 자리):
 *   - 이관을 끝내면 `gootte memo` 는 **이관된 파일을** 보여준다 — 왕복이 한 자리에서 하나가 된다.
 *   - 반대로 이관 전에(프로젝트 파일이 없으면) 읽기는 0건이다 — central 을 몰래 읽지 않는다.
 *   - `--purge` 없이 원본이 살아있다 → 기본은 보존, 지우는 일은 명시할 때만(불가역).
 * central 은 **이관 원본**일 뿐 쓰는 자리가 아니다 — 심는 것도 `writeMemoFile` 로 한다
 * (`appendMemo` 는 T02 부터 프로젝트 좌표만 받는다). 전부 임시 디렉토리 픽스처.
 */
describe("cli — memo migrate(central 을 프로젝트 파일로 옮긴다, T01)", () => {
  let root: string; // discover 의 뿌리 — 메인 사본이 여기 걸린다
  let proj: string; // 메인 프로젝트 사본
  let dataDir: string; // central 의 부모(GOOTTE_DATA 급소)

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "gootte-mig-root-"));
    proj = join(root, "jinwooauto");
    dataDir = mkdtempSync(join(tmpdir(), "gootte-mig-data-"));
    w(proj, "AGENTS.md", "# AGENTS\n");
    w(proj, "docs/features/alpha/tickets/T01.md", "# T01\n");
    process.env.GOOTTE_ROOTS = root;
  });
  afterEach(() => {
    delete process.env.GOOTTE_ROOTS;
    rmSync(root, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  });

  /** 메모 한 장의 생김새 — 저장 규약과 같은 형태(id·작성=수정 시각·완료 교차). */
  const draft = (content: string, i: number): Memo => ({
    id: `178827743576${i}-${i + 1}`,
    content,
    done: i % 2 === 1,
    createdAt: `2026-09-0${i + 1}T00:00:00.000Z`,
    updatedAt: `2026-09-0${i + 1}T00:00:00.000Z`,
  });
  /**
   * central 에 메모를 심는다 — **`writeMemoFile` 로만** 쓴다. `appendMemo` 는 T02 부터 프로젝트
   * 좌표만 받는 원장 쓰기 함수라서, central 을 거기로 채우면 테스트가 폴백을 기르는 꼴이 된다.
   */
  const seed = (...contents: string[]): Memo[] => {
    const memos = contents.map(draft);
    writeMemoFile(centralMemosFile(dataDir, "jinwooauto"), memos);
    return memos;
  };
  /** 표식만 있는 두 번째 프로젝트를 뿌리에 심는다(discover 가 slug 로 찾게). */
  const addProject = (slug: string): string => {
    const dir = join(root, slug);
    w(dir, "AGENTS.md", "# AGENTS\n");
    w(dir, "docs/features/alpha/tickets/T01.md", "# T01\n");
    return dir;
  };
  const targetFile = (): string => memosFile(proj);
  const cols = (line: string): string[] => line.split("\t");
  /** 대상 파일 원문을 그대로 읽는다 — 래퍼 객체 금지, `Memo[]` 배열 하나라는 규약도 같이 잰다. */
  const readRaw = (file: string): Memo[] => {
    const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
    expect(Array.isArray(raw)).toBe(true);
    return raw as Memo[];
  };

  it("AC1 central → 프로젝트 파일 이관, 원본은 그대로(기본은 보존)", () => {
    const memos = seed("첫 생각", "둘째 생각\n  들인 줄 verbatim");
    const out = memoMigrateText(["jinwooauto"], dataDir, proj);
    expect(cols(out)).toEqual([
      "jinwooauto",
      "write",
      `${memos.length}건`,
      targetFile(),
      `원본 유지: ${centralMemosFile(dataDir, "jinwooauto")}`,
    ]);
    // 대상은 같은 내용 · 같은 순서 — 요약도 재배열도 없다(INV-4 내용 그대로).
    expect(readRaw(targetFile())).toEqual(memos);
    expect(existsSync(centralMemosFile(dataDir, "jinwooauto"))).toBe(true);
    expect(readRaw(centralMemosFile(dataDir, "jinwooauto"))).toHaveLength(2);
  });

  it("AC2 재실행 멱등 — `skip` 한 줄, 파일 content 불변", () => {
    seed("멱등", "둘째");
    memoMigrateText(["jinwooauto"], dataDir, proj);
    const before = readFileSync(targetFile(), "utf8");
    expect(cols(memoMigrateText(["jinwooauto"], dataDir, proj))).toEqual([
      "jinwooauto",
      "skip",
      "2건",
      targetFile(),
      `원본 유지: ${centralMemosFile(dataDir, "jinwooauto")}`,
    ]);
    expect(readFileSync(targetFile(), "utf8")).toBe(before);
  });

  it("AC3 대상이 다른 내용을 갖고 있으면 오류로 멈춘다 — 덮어쓰지 않는다, 파일 변경 없음", () => {
    seed("central 쪽 최신 생각");
    const other = draft("대상 쪽 다른 생각", 5);
    writeMemoFile(targetFile(), [other]);
    const before = readFileSync(targetFile(), "utf8");
    let err: unknown;
    try {
      memoMigrateText(["jinwooauto"], dataDir, proj);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(CliError);
    const msg = (err as Error).message;
    expect(msg).toContain("이관하지 않았다");
    expect(msg).toContain("jinwooauto");
    expect(msg).toContain("다르다"); // 원인 한 줄 — 무엇을 비교해서 틀렸는지 다시 계산하지 않는다
    expect(readFileSync(targetFile(), "utf8")).toBe(before);
    expect(readRaw(centralMemosFile(dataDir, "jinwooauto"))).toHaveLength(1); // 원본도 그대로
  });

  it("AC4 --purge 는 쓰기 성공 **뒤에** central 을 지운다 — 삭제 경로를 출력에 남긴다", () => {
    const memos = seed("지워질 원본", "둘째");
    const c = cols(memoMigrateText(["jinwooauto", "--purge"], dataDir, proj));
    expect(c[1]).toBe("write");
    expect(c[4]).toBe(`원본 삭제: ${centralMemosFile(dataDir, "jinwooauto")}`);
    expect(readRaw(targetFile())).toEqual(memos); // 먼저 쓰였고
    expect(existsSync(centralMemosFile(dataDir, "jinwooauto"))).toBe(false); // 그 뒤에 지워졌다
  });

  it("AC4 --purge 뒤 재실행 — 원본이 없으니 이관 대상 없음(조용한 되살림 없음)", () => {
    seed("한 번만");
    memoMigrateText(["jinwooauto", "--purge"], dataDir, proj);
    expect(memoMigrateText(["jinwooauto", "--purge"], dataDir, proj)).toContain("(이관 대상 없음)");
    expect(existsSync(centralMemosFile(dataDir, "jinwooauto"))).toBe(false);
  });

  it("🔴 --purge 도 충돌을 이기지 못한다 — 판정이 오류면 지우지 않는다(원본이 마지막 사본이다)", () => {
    seed("central 원본");
    writeMemoFile(targetFile(), [draft("대상 원고", 5)]);
    expect(() => memoMigrateText(["jinwooauto", "--purge"], dataDir, proj)).toThrow(CliError);
    expect(existsSync(centralMemosFile(dataDir, "jinwooauto"))).toBe(true);
  });

  it("AC5 인자 생략 — 지금 프로젝트(cwd)가 대상이다", () => {
    seed("cwd 유추 이관");
    const out = memoMigrateText([], dataDir, join(proj, "docs", "features")); // 하위 디렉토리에서도 같은 답
    expect(cols(out)).toEqual([
      "jinwooauto",
      "write",
      "1건",
      targetFile(),
      `원본 유지: ${centralMemosFile(dataDir, "jinwooauto")}`,
    ]);
    expect(existsSync(targetFile())).toBe(true);
  });

  it("AC5 이관 대상이 없으면 `(이관 대상 없음)` exit 0 — 오류가 아니고 파일을 만들지도 않는다", () => {
    expect(memoMigrateText(["jinwooauto"], dataDir, proj)).toBe("(이관 대상 없음)");
    expect(memoMigrateText([], dataDir, proj)).toBe("(이관 대상 없음)");
    expect(existsSync(targetFile())).toBe(false);
  });

  it("모르는 플래그·`--purge <값>`·프로젝트 밖 — 모두 사용자 오류로 멈춘다", () => {
    seed("메모");
    expect(() => memoMigrateText(["jinwooauto", "--dry-run"], dataDir, proj)).toThrow(/--dry-run 는 받지 않는다/);
    // parseArgs 가 slug 를 플래그 값으로 삼킨다 — cwd 유추로 조용히 대체하지 않는다.
    expect(() => memoMigrateText(["--purge", "jinwooauto"], dataDir, proj)).toThrow(/--purge 는 값을 받지 않는다/);
    expect(() => memoMigrateText([], dataDir, "/")).toThrow(CliError);
    expect(existsSync(targetFile())).toBe(false);
  });

  it("여러 프로젝트를 한 번에 — 둘 다 건너간다", () => {
    const second = addProject("voice-to-iterm");
    seed("jinwooauto 생각");
    writeMemoFile(centralMemosFile(dataDir, "voice-to-iterm"), [draft("voice 생각", 5)]);
    const out = memoMigrateText(["jinwooauto", "voice-to-iterm"], dataDir, proj);
    expect(out.split("\n")).toHaveLength(2);
    expect(existsSync(targetFile())).toBe(true);
    expect(existsSync(memosFile(second))).toBe(true);
  });

  it("🔴 충돌이 섞인 배치는 아무것도 쓰지 않는다 — 반쯤 이관된 원장이 남는 것이 제일 위험하다", () => {
    addProject("memo");
    seed("jinwooauto 생각");
    writeMemoFile(centralMemosFile(dataDir, "memo"), [draft("memo 원본", 6)]);
    writeMemoFile(memosFile(join(root, "memo")), [draft("memo 대상 원고", 6)]);
    expect(() => memoMigrateText(["jinwooauto", "memo"], dataDir, proj)).toThrow(/메모를 이관하지 않았다/);
    expect(existsSync(targetFile())).toBe(false); // 앞에 있던 것까지 안 쓴다
    expect(readRaw(memosFile(join(root, "memo")))[0]!.content).toBe("memo 대상 원고");
  });

  it("🔴 worktree 사본에서 돌아도 **메인에** 쓴다 — 사본마다 memo.json 이 따로 생기면 안 된다(INV-1)", () => {
    // 실물 git worktree 를 같은 basename 으로 만든다 — discover 의 대표 경로(copies[0])가
    // worktree 가 되므로, 메인 승격이 없으면 메모 파일이 그 사본에 따로 생긴다.
    const wtParent = mkdtempSync(join(tmpdir(), "gootte-mig-wt-"));
    const wt = join(wtParent, "jinwooauto");
    try {
      const git = (args: string[]): void => {
        execFileSync("git", ["-C", proj, ...args], { stdio: "ignore" });
      };
      git(["init", "-q"]);
      git(["config", "user.email", "crew@example.com"]);
      git(["config", "user.name", "crew"]);
      git(["config", "commit.gpgsign", "false"]);
      git(["symbolic-ref", "HEAD", "refs/heads/main"]);
      git(["add", "-A"]);
      git(["commit", "-q", "-m", "seed"]);
      git(["worktree", "add", "-q", "-b", "mig-wt", wt]);

      seed("메인에 써야 한다");
      process.env.GOOTTE_ROOTS = `${wtParent}:${root}`;
      // 전제: discover 대표 경로가 worktree 로 걸린다(승격이 실제로 일하는 자리인지 먼저 확인).
      expect(resolveProjectPath("jinwooauto", wt)).toBe(wt);

      const written = cols(memoMigrateText(["jinwooauto"], dataDir, wt))[3]!;
      expect(existsSync(memosFile(wt))).toBe(false); // 사본에는 생기지 않는다
      expect(realpathSync(written)).toBe(realpathSync(targetFile())); // 메인에 생겼다
      expect(existsSync(targetFile())).toBe(true);
    } finally {
      rmSync(wtParent, { recursive: true, force: true });
    }
  });

  /**
   * 🔴 순서 규칙의 앞편(T02 에서 뒤집힌 가드) — 읽기가 프로젝트 파일로 돌아간 뒤에는
   * **이관이 곧 화면에 닿는다**. 이관 전에 0건이고(폴백 없음), 이관 뒤에 그 목록이 보인다.
   * 이 두 얼굴이 한 테이블에서 함께 보여야 한다 — 하나만 있으면 폴백을 구분할 방법이 없다.
   */
  it("🔴 이관 전 0건 → 이관 뒤 같은 목록 — 읽기는 프로젝트 파일만 본다(T02 전환)", () => {
    seed("이관되면 보이는 생각");
    // 1) 아직 이관 전: central 에 원본이 살아있지만 읽기는 0건이다(폴백 없음의 얼굴).
    expect(memoText([], proj)).toBe(`== jinwooauto · 메모 없음 ==`);
    // 2) 이관을 끝내면 그 순간 왕복이 하나가 된다 — 왕복 중에 데이터가 사라지지 않았다(순서 강제의 이유).
    memoMigrateText(["jinwooauto"], dataDir, proj);
    const out = memoText([], proj);
    expect(out).toContain("이관되면 보이는 생각");
    expect(out).toContain("메모 1건");
    // 3) central 은 여전히 그 자리에 있다(이 표는 읽지 않을 뿐, 지우지 않는다).
    expect(existsSync(centralMemosFile(dataDir, "jinwooauto"))).toBe(true);
  });
});
