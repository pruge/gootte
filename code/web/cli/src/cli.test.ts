import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, it, expect } from "vitest";
import {
  backlogFile,
  discoverProjects,
  readPlacements,
  readSteps,
  writePlanMove,
  writeSettings,
} from "@gootte/core-io";
import { CliError } from "./args";
import { setTicketDoneResolver } from "@gootte/core";
import { boardText, discoverText, nextText, resolveProjectPath, stepClearText, stepText } from "./commands";

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
      // 두 사본을 다 보게 하면 갈라짐 사실이 한 줄로 실린다 — 어느 파일·어느 사본인지 말한다(AC2).
      expect(out2).toContain("! 갈라짐: spec.md");
      expect(out2).toContain(a);
      expect(out2).toContain(b);
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
 * firstmate 홈 백로그 픽스처 — 부모 작업 하나(메모에 `docs/features/<기능>/`)와 자식 티켓 둘.
 * T01 은 done, T02 는 queued — 조인이 얹히면 T01 만 사라져야 한다.
 */
function backlogWithT01Done(home: string, repo: string, feature: string): void {
  const parent = `${repo}-plan`;
  mkdirSync(join(home, "data"), { recursive: true });
  writeFileSync(
    backlogFile(home),
    [
      "# Backlog",
      "",
      "## Done",
      `- [x] ${parent} - parent https://x/pr/9 (repo: ${repo}) (kind: plan) (merged 2026-08-20)`,
      `    Artifacts: docs/features/${feature}/`,
      `- [x] ${parent}-t01 - 첫 티켓 https://x/pr/1 (repo: ${repo}) (kind: ship) (merged 2026-08-21)`,
      "",
      "## Queued",
      `- [ ] ${parent}-t02 - 둘째 티켓 (repo: ${repo})`,
      "",
    ].join("\n"),
  );
}

/**
 * 백로그 상태 조인(the-terminal-agrees-with-the-screen T01) — CLI `board`·`next` 가 화면과 **같은**
 * 판정 자리(`applyBacklogStatus`)를 지나는가. 신관례(`tickets/T<NN>.md`) 티켓의 상태 단일 출처는
 * firstmate 홈 백로그다 — 조인 없이 CLI 는 이미 끝난 티켓을 미완료로 보고 next 가 다시 내놓는다(spec §문제).
 */
describe("cli — board·next 에 백로그 조인(T01)", () => {
  let proj: string;
  let dataDir: string;
  let home: string;

  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), "gootte-backlog-proj-"));
    dataDir = mkdtempSync(join(tmpdir(), "gootte-backlog-db-"));
    home = mkdtempSync(join(tmpdir(), "gootte-backlog-home-"));
    w(proj, "AGENTS.md", "# AGENTS\n");
    w(proj, "docs/features/g/tickets/T01.md", "# T01 — c\n\n## Depends on\n- nothing\n");
    w(proj, "docs/features/g/tickets/T02.md", "# T02 — d\n\n## Depends on\n- nothing\n");
    activate(dataDir, slug(), "g");
    backlogWithT01Done(home, slug(), "g");
    // 🔴 T03 — 기본 리졸버는 "아무것도 완료 아님"(git 미연동, 테스트 픽스처엔 git 없음).
    // done 이 필요한 테스트는 아래서 true 로 세팅한다.
    setTicketDoneResolver(() => false);
    writeSettings(dataDir, { firstmateHome: home });
  });
  afterEach(() => {
    for (const p of [proj, dataDir, home]) rmSync(p, { recursive: true, force: true });
  });

  const slug = () => basename(proj);

  it("next — 🔴 백로그에서 이미 done 인 신관례 티켓을 내보내지 않는다", () => {
    stepText([slug(), "g/T01", "1"], dataDir, proj);
    stepText([slug(), "g/T02", "2"], dataDir, proj);
    // 🔴 T03 — done 출처는 git 리졸버다(백로그는 완료를 말하지 않는다). T01 을 리졸버 done.
    setTicketDoneResolver((r, s, n) => n === "01");
    // 조인 없었다면 1단계인 T01 이 나왔을 것이다 — done 로 조인됐으므로 T02 만 나온다.
    expect(nextText([slug()], dataDir, proj)).toBe("g/T02\td");
  });

  it("board — 🔴 전부 끝난 신관례 기능은 완료 칸으로 넘어간다(조인 → 자동 닫힘 같은 자리)", () => {
    // 🔴 T03 — done 출처는 git 리졸버다(백로그는 완료를 말하지 않는다). T01·T02 를 리졸버 done.
    setTicketDoneResolver((r, s, n) => n === "01" || n === "02");
    // T02 도 백로그에서 done 으로 — 기능 g 의 티켓이 전부 완료된다.
    writeFileSync(
      backlogFile(home),
      [
        "# Backlog",
        "",
        "## Done",
        `- [x] ${slug()}-plan - parent (repo: ${slug()})`,
        `    Artifacts: docs/features/g/`,
        `- [x] ${slug()}-plan-t01 - 첫 (repo: ${slug()})`,
        `- [x] ${slug()}-plan-t02 - 둘째 (repo: ${slug()})`,
        "",
      ].join("\n"),
    );
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

  it("홈 미설정(설정 파일 없음) — 명령이 죽지 않고 조인만 꺼진다(INV-U1)", () => {
    const bareDataDir = mkdtempSync(join(tmpdir(), "gootte-bare-db-"));
    try {
      activate(bareDataDir, slug(), "g");
      stepText([slug(), "g/T01", "1"], bareDataDir, proj);
      stepText([slug(), "g/T02", "2"], bareDataDir, proj);
      // 조인이 꺼졌으므로 문서만으로 판정 — T01 은 여전히 미완료로 보여 next 에 나온다.
      expect(nextText([slug()], bareDataDir, proj)).toBe("g/T01\tc");
    } finally {
      rmSync(bareDataDir, { recursive: true, force: true });
    }
  });

  it("백로그 파일이 아직 없어도 조용히 조인 없이 지난다", () => {
    rmSync(backlogFile(home));
    stepText([slug(), "g/T01", "1"], dataDir, proj);
    stepText([slug(), "g/T02", "2"], dataDir, proj);
    expect(nextText([slug()], dataDir, proj)).toBe("g/T01\tc");
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
