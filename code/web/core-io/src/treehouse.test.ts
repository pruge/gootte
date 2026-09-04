import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyInProgress } from "@gootte/core";
import { readFeatures } from "./features";
import { bbWorktreeRoots, scanWorkingCopies } from "./treehouse";

/**
 * 처리중 판정 — **이 저장소에 전례가 없는 판정**이라 이 파일이 그것을 처음 덮는다.
 * git 상태가 입력이므로 임시 저장소 픽스처를 실제로 만든다(사양 §검증).
 */

const PROJECT = "alpha";
const POOL = `${PROJECT}-abc123`;

let tmp: string;
let root: string; // 격리 사본 뿌리
let project: string; // 관리대상 프로젝트

function git(repo: string, ...args: string[]): void {
  execFileSync("git", ["-C", repo, ...args], { stdio: "ignore" });
}

function initRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  execFileSync("git", ["init", "-q", dir], { stdio: "ignore" });
  git(dir, "symbolic-ref", "HEAD", "refs/heads/main"); // 기본 가지 이름은 git 버전마다 다르다
  git(dir, "config", "user.email", "crew@example.com");
  git(dir, "config", "user.name", "crew");
  git(dir, "config", "commit.gpgsign", "false");
}

function commit(dir: string, files: Record<string, string>, message: string): void {
  for (const [rel, body] of Object.entries(files)) {
    const path = join(dir, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
  }
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", message);
}

/** `<뿌리>/<풀>/<슬롯>/<프로젝트>/` 사본 하나. `branch` 없으면 detached = 유휴(F7). */
function makeCopy(
  opts: { pool?: string; slot: string; branch?: string; work?: Record<string, string> } = {
    slot: "1",
  },
): string {
  const repo = join(root, opts.pool ?? POOL, opts.slot, PROJECT);
  initRepo(repo);
  commit(repo, { "README.md": "base\n" }, "base");
  if (!opts.branch) {
    git(repo, "checkout", "-q", "--detach");
    return repo;
  }
  git(repo, "checkout", "-q", "-b", opts.branch);
  if (opts.work) commit(repo, opts.work, "work");
  return repo;
}

const ticketFile = (num: string, title: string) =>
  `# ${num} — ${title}\n\n**Status:** ready-for-agent\n`;

/** 처리중 판정(ADR 0001)은 Time 기록(started=)으로만 — 테스트가 그 기록을 붙이는 자리. */
const startedTicketFile = (num: string, title: string) =>
  `# ${num} — ${title}\n\n**Status:** ready-for-agent\n\n**Time:** started=2026-09-02T09:00:00Z\n`;

/**
 * 관리대상(main 프로젝트)의 티켓 파일에 `Time: started=` 를 얹는다 — applyInProgress 는
 * readFeatures([project]) 로 읽은 문서의 startedAt 으로 처리중을 판정한다(관측은 미해소 구역만 낸다).
 */
function startTicket(file: string, num: string, title: string): void {
  const path = join(project, "docs", "features", "auth", "issues", file);
  writeFileSync(path, startedTicketFile(num, title));
}

/** 관리대상의 할일 목록 — 여기에는 처리중이 **적혀 있지 않다**(정규 여덟 값에 없다). */
function makeProject(): void {
  mkdirSync(join(project, "docs", "features", "auth", "issues"), { recursive: true });
  writeFileSync(join(project, "docs", "features", "auth", "spec.md"), "# auth\n\nStatus: draft\n");
  for (const [file, title] of [
    ["01-session.md", "세션 발급"],
    ["02-screen.md", "로그인 화면"],
  ])
    writeFileSync(
      join(project, "docs", "features", "auth", "issues", file as string),
      ticketFile((file as string).slice(0, 2), title as string),
    );
}

/** 화면이 받는 것과 같은 계산 — 문서 read + 사본 관측 + 순수 계산. */
function observe(scanRoot = root, projectPaths: string[] = [], bbRoot?: string) {
  return applyInProgress(
    readFeatures([project]),
    scanWorkingCopies(scanRoot, PROJECT, projectPaths, bbRoot),
  );
}
const ticketOf = (features: ReturnType<typeof observe>["features"], slug: string) =>
  features.find((f) => f.slug === "auth")?.tickets.find((t) => t.slug === slug);

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "gootte-treehouse-"));
  root = join(tmp, "treehouse");
  project = join(tmp, "projects", PROJECT);
  makeProject();
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("scanWorkingCopies — 격리 사본이 말해주는 처리중", () => {
  it("작업 가지의 커밋이 티켓 파일을 건드리고 Time 기록(started=)이 있으면 처리중", () => {
    startTicket("02-screen.md", "02", "로그인 화면");
    makeCopy({
      slot: "1",
      branch: "fm/alpha-login-screen", // 🔴 이름에는 티켓 번호가 없다 — 이름으로 잇지 않는다
      work: { "docs/features/auth/issues/02-screen.md": startedTicketFile("02", "로그인 화면") },
    });

    const { features, inProgress } = observe();
    expect(ticketOf(features, "02-screen")?.status).toBe("in_progress");
    expect(ticketOf(features, "01-session")?.status).toBe("pending");
    expect(inProgress).toMatchObject({ rootExists: true, copies: 1, working: 1, tickets: 1 });
    expect(inProgress.unknown).toEqual([]);
  });

  it("🔴 브랜치가 티켓 파일을 건드려도 Time 기록(started=)이 없으면 처리중이 아니다 — 자동 처리중 폐기(ADR 0001)", () => {
    // main 프로젝트 티켓에 Time 이 없다(처리중 판정 근거 없음). 브랜치가 파일을 건드려도 pending.
    makeCopy({
      slot: "1",
      branch: "fm/touches-but-not-started",
      work: { "docs/features/auth/issues/02-screen.md": ticketFile("02", "로그인 화면") },
    });

    const { features, inProgress } = observe();
    expect(ticketOf(features, "02-screen")?.status).toBe("pending");
    expect(inProgress.tickets).toBe(0);
    // 작업중 사본은 여전히 보인다(INV-4) — 알려진 티켓을 건드렸으므로 미상도 아니다.
    expect(inProgress.working).toBe(1);
    expect(inProgress.unknown).toEqual([]);
  });

  it("유휴 사본(detached HEAD)은 아무 티켓도 처리중으로 만들지 않는다", () => {
    makeCopy({ slot: "1" });

    const { features, inProgress } = observe();
    expect(features[0]?.tickets.every((t) => t.status === "pending")).toBe(true);
    expect(inProgress).toMatchObject({ copies: 1, working: 0, tickets: 0 });
    expect(inProgress.unknown).toEqual([]);
  });

  it("🔴 작업중인데 티켓 파일을 안 건드린 사본은 사라지지 않고 `티켓 미상 · 작업중` 으로 세어진다", () => {
    makeCopy({
      slot: "1",
      branch: "fm/refactor-core",
      work: { "code/core.ts": "export const x = 1;\n" },
    });

    const { features, inProgress } = observe();
    // 화면이 "아무도 아무것도 안 하는 중" 이라고 거짓말하면 캡틴이 같은 일을 다시 배정한다.
    expect(features[0]?.tickets.every((t) => t.status === "pending")).toBe(true);
    expect(inProgress.tickets).toBe(0);
    expect(inProgress.working).toBe(1);
    expect(inProgress.unknown).toHaveLength(1);
    expect(inProgress.unknown[0]).toMatchObject({
      slug: `${POOL}/1`,
      branch: "fm/refactor-core",
    });
    expect(inProgress.unknown[0]?.path).toContain(join(POOL, "1", PROJECT));
  });

  it("🔴 가지는 만들었지만 아직 커밋이 없는 사본도 미상으로 드러난다 — 작업은 이미 시작됐다", () => {
    makeCopy({ slot: "1", branch: "fm/just-started" });

    const { inProgress } = observe();
    expect(inProgress.working).toBe(1);
    expect(inProgress.unknown.map((u) => u.branch)).toEqual(["fm/just-started"]);
  });

  it("격리 사본 뿌리가 없으면 빈 결과 — 예외로 죽지 않는다", () => {
    const { features, inProgress } = observe(join(tmp, "없는-뿌리"));

    expect(features[0]?.tickets).toHaveLength(2); // 할일 목록은 그대로 산다
    expect(inProgress).toMatchObject({ rootExists: false, copies: 0, working: 0, tickets: 0 });
    expect(inProgress.unknown).toEqual([]);
    expect(inProgress.unreadable).toEqual([]);
  });

  it("한 티켓을 두 사본이 붙들고 있어도 중복으로 두 번 세지 않는다", () => {
    startTicket("02-screen.md", "02", "로그인 화면");
    const work = { "docs/features/auth/issues/02-screen.md": startedTicketFile("02", "로그인 화면") };
    makeCopy({ slot: "1", branch: "fm/a", work });
    makeCopy({ slot: "2", branch: "fm/b", work });

    const { features, inProgress } = observe();
    expect(inProgress.tickets).toBe(1); // 티켓 하나
    expect(inProgress.working).toBe(2); // 사본 둘 — 둘 다 보인다
  });

  it("🔴 저장소를 못 찾은 슬롯은 건너뛰지 않고 `못 읽음` 으로 센다", () => {
    mkdirSync(join(root, POOL, "1", PROJECT), { recursive: true }); // `.git` 없음(복제 중 등)

    const { inProgress } = observe();
    expect(inProgress.copies).toBe(1); // 사본 수에서도 사라지지 않는다
    expect(inProgress.unreadable).toEqual([
      { slug: `${POOL}/1`, path: join(root, POOL, "1"), reason: "no-repo" },
    ]);
  });

  it("🔴 git 이 답하지 않는 사본을 유휴로 접지 않는다 — 실제로 돌고 있을 수 있다", () => {
    const repo = join(root, POOL, "1", PROJECT);
    mkdirSync(repo, { recursive: true });
    writeFileSync(join(repo, ".git"), "gitdir: /없는/경로\n"); // 깨진 worktree 포인터

    const { inProgress } = observe();
    expect(inProgress.working).toBe(0);
    expect(inProgress.unreadable).toEqual([
      { slug: `${POOL}/1`, path: repo, reason: "git-failed" },
    ]);
  });

  it("비 ASCII 슬러그의 티켓도 이어진다 — git 의 경로 이스케이프에 걸려 미상으로 흘리지 않는다", () => {
    const dir = join(project, "docs", "features", "결제", "issues");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "01-환불.md"), startedTicketFile("01", "환불"));
    makeCopy({
      slot: "1",
      branch: "fm/refund",
      work: { "docs/features/결제/issues/01-환불.md": ticketFile("01", "환불") },
    });

    const { features, inProgress } = observe();
    const t = features.find((f) => f.slug === "결제")?.tickets[0];
    expect(t?.status).toBe("in_progress");
    expect(inProgress.unknown).toEqual([]);
  });

  it("다른 프로젝트의 풀은 이 프로젝트의 처리중이 아니다", () => {
    makeCopy({
      pool: "beta-def456",
      slot: "1",
      branch: "fm/other",
      work: { "docs/features/auth/issues/02-screen.md": "x\n" },
    });

    const { features, inProgress } = observe();
    expect(ticketOf(features, "02-screen")?.status).toBe("pending");
    expect(inProgress).toMatchObject({ copies: 0, working: 0, tickets: 0 });
  });

  it("사본 여럿이 서로 다른 티켓을 붙들면 각각 처리중", () => {
    startTicket("01-session.md", "01", "세션 발급");
    startTicket("02-screen.md", "02", "로그인 화면");
    makeCopy({
      slot: "1",
      branch: "fm/a",
      work: { "docs/features/auth/issues/01-session.md": startedTicketFile("01", "세션 발급") },
    });
    makeCopy({
      slot: "2",
      branch: "fm/b",
      work: { "docs/features/auth/issues/02-screen.md": startedTicketFile("02", "로그인 화면") },
    });

    const { features, inProgress } = observe();
    expect(ticketOf(features, "01-session")?.status).toBe("in_progress");
    expect(ticketOf(features, "02-screen")?.status).toBe("in_progress");
    expect(inProgress.tickets).toBe(2);
  });

  it("🔴 로컬 main 은 뒤처졌고 origin/main 은 최신이다 — origin/main 을 기준으로 삼아, 이미 올라간 커밋을 이 가지의 일로 세지 않는다", () => {
    // bare origin: base 커밋 하나.
    const bare = join(tmp, "bare-origin.git");
    execFileSync("git", ["init", "-q", "--bare", bare], { stdio: "ignore" });
    git(bare, "symbolic-ref", "HEAD", "refs/heads/main"); // 기본 가지 이름은 git 버전마다 다르다
    const scratch = join(tmp, "scratch");
    initRepo(scratch);
    commit(scratch, { "README.md": "base\n" }, "base");
    git(scratch, "remote", "add", "origin", bare);
    git(scratch, "push", "-q", "origin", "main");

    // repo = 격리 사본. bare 를 복제해 local main == origin/main == base.
    const repo = join(root, POOL, "1", PROJECT);
    mkdirSync(dirname(repo), { recursive: true });
    execFileSync("git", ["clone", "-q", bare, repo], { stdio: "ignore" });
    git(repo, "config", "user.email", "crew@example.com");
    git(repo, "config", "user.name", "crew");
    git(repo, "config", "commit.gpgsign", "false");

    // 사본에서 작업 가지를 만들어 티켓 파일을 건드리고, 그 커밋을 origin main 으로 곧장 밀어 넣는다
    // (다른 경로로 이미 병합됐다고 가정) — 로컬 main 은 여전히 base 를 가리킨다.
    git(repo, "checkout", "-q", "-b", "fm/x");
    commit(repo, { "docs/features/auth/issues/01-session.md": ticketFile("01", "세션 발급") }, "work");
    git(repo, "push", "-q", "origin", "fm/x:main");
    git(repo, "fetch", "-q", "origin"); // 테스트 셋업만의 fetch — 앱 코드는 fetch 하지 않는다(INV-2)

    const { features, inProgress } = observe();
    expect(ticketOf(features, "01-session")?.status).toBe("pending");
    expect(inProgress.tickets).toBe(0);
  });

  it("🔴 remote 가 없는 저장소는 로컬 main 으로 떨어진다 — 빈 목록이 되지 않는다", () => {
    startTicket("01-session.md", "01", "세션 발급");
    makeCopy({
      slot: "1",
      branch: "fm/no-remote",
      work: { "docs/features/auth/issues/01-session.md": startedTicketFile("01", "세션 발급") },
    });

    const { features, inProgress } = observe();
    expect(ticketOf(features, "01-session")?.status).toBe("in_progress");
    expect(inProgress.tickets).toBe(1);
  });

  it("🔴 기준 가지 후보가 하나도 없으면 지금처럼 빈 목록이다 — 전체 이력을 훑지 않는다", () => {
    const repo = join(root, POOL, "1", PROJECT);
    mkdirSync(repo, { recursive: true });
    execFileSync("git", ["init", "-q", repo], { stdio: "ignore" });
    git(repo, "symbolic-ref", "HEAD", "refs/heads/trunk"); // main/master 어느 쪽도 아니다
    git(repo, "config", "user.email", "crew@example.com");
    git(repo, "config", "user.name", "crew");
    git(repo, "config", "commit.gpgsign", "false");
    commit(repo, { "README.md": "base\n" }, "base");
    git(repo, "checkout", "-q", "-b", "fm/orphan");
    commit(repo, { "docs/features/auth/issues/01-session.md": ticketFile("01", "세션 발급") }, "work");

    const { features, inProgress } = observe();
    // 이을 근거(기준 가지)가 없으니 이 티켓은 처리중이 아니다 — 전체 이력을 훑어 갖다 붙이지 않는다.
    expect(ticketOf(features, "01-session")?.status).toBe("pending");
    expect(inProgress.tickets).toBe(0);
    // 그렇다고 작업중이라는 사실 자체를 숨기지도 않는다 — 티켓 미상으로 드러난다.
    expect(inProgress.unknown.map((u) => u.branch)).toEqual(["fm/orphan"]);
  });

  it("🔴 관리대상에도 사본에도 아무것도 쓰지 않는다(INV-2) — 관측 후 워킹트리가 깨끗하다", () => {
    const repo = makeCopy({
      slot: "1",
      branch: "fm/a",
      work: { "docs/features/auth/issues/02-screen.md": ticketFile("02", "로그인 화면") },
    });
    observe();

    expect(execFileSync("git", ["-C", repo, "status", "--porcelain"], { encoding: "utf8" })).toBe(
      "",
    );
    // 관측한 처리중이 티켓 파일에 되쓰이지 않았다 — 두 번째 기록이 생기는 순간이 desync 의 시작이다(INV-1).
    expect(readFeatures([project]).flatMap((f) => f.tickets).map((t) => t.sourceStatus)).toEqual([
      "ready-for-agent",
      "ready-for-agent",
    ]);
  });

  it("🔴 Claude Code worktree(.claude/worktrees)도 treehouse 와 같은 규칙으로 관측된다", () => {
    // 관리대상 프로젝트 안에 Claude Code 가 만든 git worktree 를 합성한다 — `.git` 이 파일이다.
    const mainRepo = join(tmp, "projects", PROJECT);
    initRepo(mainRepo);
    git(mainRepo, "checkout", "-q", "-b", "main");
    commit(mainRepo, { "README.md": "base\n" }, "base");
    const wtName = "fm-auth-screen";
    const wt = join(mainRepo, ".claude", "worktrees", wtName);
    execFileSync(
      "git",
      ["-C", mainRepo, "worktree", "add", "-q", "-b", `worktree-${wtName}`, wt],
      { stdio: "ignore" },
    );
    // 그 worktree 가지에서 티켓 파일을 건드린 커밋을 만든다 — treehouse 사본과 같은 입력이다.
    commit(wt, { "docs/features/auth/issues/02-screen.md": startedTicketFile("02", "로그인 화면 v2") }, "work");
    // worktree 를 만들면 기본 main 가지도 생기므로(기준 가지 존재), 이슈 커밋이 "이 가지의 일" 로 이어진다.
    git(wt, "checkout", "-q", "-b", `worktree-${wtName}-2`);
    commit(wt, { "docs/features/auth/issues/01-session.md": startedTicketFile("01", "세션 발급 v2") }, "work2");
    // 관리대상(main) 티켓에도 Time 기록을 얹는다 — 처리중은 main 문서의 startedAt 으로 판정(ADR 0001).
    startTicket("01-session.md", "01", "세션 발급");
    startTicket("02-screen.md", "02", "로그인 화면");

    const { features, inProgress } = observe(root, [mainRepo]);
    expect(ticketOf(features, "01-session")?.status).toBe("in_progress");
    expect(ticketOf(features, "02-screen")?.status).toBe("in_progress");
    // treehouse 는 비어 있으므로 rootExists 는 거짓, 그런데도 worktree 사본은 드러난다(INV-4).
    expect(inProgress.rootExists).toBe(false);
    expect(inProgress.copies).toBe(1);
    expect(inProgress.working).toBe(1);
    expect(inProgress.unknown).toEqual([]);
    expect(inProgress.unreadable).toEqual([]);
    expect(inProgress.unclaimed).toEqual([]);
  });

  it("🔴 Claude Code worktree 의 슬러그는 treehouse 와 겹치지 않는다(<프로젝트>/claude/<이름>)", () => {
    const mainRepo = join(tmp, "projects", PROJECT);
    initRepo(mainRepo);
    git(mainRepo, "checkout", "-q", "-b", "main");
    commit(mainRepo, { "README.md": "base\n" }, "base");
    const wt = join(mainRepo, ".claude", "worktrees", "fm-x");
    execFileSync("git", ["-C", mainRepo, "worktree", "add", "-q", "-b", "worktree-fm-x", wt], {
      stdio: "ignore",
    });
    commit(wt, { "docs/features/auth/issues/02-screen.md": startedTicketFile("02", "로그인 화면 v2") }, "work");
    // main 문서에도 Time 을 얹는다 — 처리중은 main 의 startedAt 으로 판정(ADR 0001).
    startTicket("02-screen.md", "02", "로그인 화면");

    // raw 관측에서 슬러그가 `<프로젝트>/claude/<이름>` 인지 직접 본다 — treehouse(`<풀>/<슬롯>`)와
    // 겹치지 않는 식별자여야 차단 목록(blockedCopies)에서 헷갈리지 않는다(INV-5).
    const scan = scanWorkingCopies(root, PROJECT, [mainRepo]);
    expect(scan.copies.map((c) => c.slug)).toEqual([`${PROJECT}/claude/fm-x`]);
    expect(scan.copies[0]?.state).toBe("working");
    // 그 worktree 의 작업이 티켓에 이어진다 — 처리중으로 표시된다(관측은 같은 규칙을 쓴다).
    const { features } = observe(root, [mainRepo]);
    expect(ticketOf(features, "02-screen")?.status).toBe("in_progress");
  });

  /**
   * BB 에이전트 worktree — 스레드로 작업하면 `~/.bb/worktrees/<env>/<프로젝트>` 에 트리가 생긴다.
   * treehouse·Claude Code 와 자리만 다르고 같은 git worktree 이므로 같은 규칙으로 관측돼야 한다.
   */
  function makeBbWorktree(envName: string, branch: string, work: Record<string, string>): {
    bbRoot: string;
    mainRepo: string;
    wt: string;
  } {
    const mainRepo = join(tmp, "projects", PROJECT);
    initRepo(mainRepo);
    git(mainRepo, "checkout", "-q", "-b", "main");
    commit(mainRepo, { "README.md": "base\n" }, "base");
    const bbRoot = join(tmp, "bb-worktrees");
    const wt = join(bbRoot, envName, PROJECT);
    mkdirSync(dirname(wt), { recursive: true });
    execFileSync("git", ["-C", mainRepo, "worktree", "add", "-q", "-b", branch, wt], {
      stdio: "ignore",
    });
    commit(wt, work, "work");
    return { bbRoot, mainRepo, wt };
  }

  it("🔴 BB 에이전트 worktree(~/.bb/worktrees/<env>/<프로젝트>)도 treehouse 와 같은 규칙으로 관측된다", () => {
    const { bbRoot, mainRepo } = makeBbWorktree("env_n8franv9qv", "bb/t01-thr_9vbsnd5pgc", {
      "docs/features/auth/issues/02-screen.md": startedTicketFile("02", "로그인 화면 v2"),
    });
    // 처리중은 관리대상(main) 문서의 startedAt 으로 판정한다(ADR 0001).
    startTicket("02-screen.md", "02", "로그인 화면");

    const scan = scanWorkingCopies(root, PROJECT, [mainRepo], bbRoot);
    // 슬러그는 `<프로젝트>/bb/<env>` — treehouse(`<풀>/<슬롯>`)·claude(`<프로젝트>/claude/<이름>`)와
    // 겹치지 않아야 차단 목록에서 헷갈리지 않는다.
    expect(scan.copies.map((c) => c.slug)).toEqual([`${PROJECT}/bb/env_n8franv9qv`]);
    expect(scan.copies[0]?.state).toBe("working");
    expect(scan.copies[0]?.branch).toBe("bb/t01-thr_9vbsnd5pgc");

    const { features, inProgress } = observe(root, [mainRepo], bbRoot);
    expect(ticketOf(features, "02-screen")?.status).toBe("in_progress");
    expect(inProgress.copies).toBe(1);
    expect(inProgress.working).toBe(1);
  });

  it("🔴 BB worktree 와 Claude Code worktree 가 같이 있으면 둘 다 센다 — 한쪽이 다른 쪽을 가리지 않는다", () => {
    const { bbRoot, mainRepo } = makeBbWorktree("env_aaa", "bb/t02-thr_x", {
      "docs/features/auth/issues/02-screen.md": startedTicketFile("02", "로그인 화면 v2"),
    });
    const claudeWt = join(mainRepo, ".claude", "worktrees", "fm-x");
    execFileSync("git", ["-C", mainRepo, "worktree", "add", "-q", "-b", "worktree-fm-x", claudeWt], {
      stdio: "ignore",
    });
    commit(claudeWt, { "docs/features/auth/issues/01-session.md": startedTicketFile("01", "세션 발급 v2") }, "work");
    startTicket("01-session.md", "01", "세션 발급");
    startTicket("02-screen.md", "02", "로그인 화면");

    const scan = scanWorkingCopies(root, PROJECT, [mainRepo], bbRoot);
    expect(scan.copies.map((c) => c.slug).sort()).toEqual([
      `${PROJECT}/bb/env_aaa`,
      `${PROJECT}/claude/fm-x`,
    ]);
    const { features } = observe(root, [mainRepo], bbRoot);
    expect(ticketOf(features, "01-session")?.status).toBe("in_progress");
    expect(ticketOf(features, "02-screen")?.status).toBe("in_progress");
  });

  it("🔴 BB 뿌리에 다른 프로젝트만 있으면 이 프로젝트의 사본이 아니다", () => {
    const mainRepo = join(tmp, "projects", PROJECT);
    initRepo(mainRepo);
    git(mainRepo, "checkout", "-q", "-b", "main");
    commit(mainRepo, { "README.md": "base\n" }, "base");
    const bbRoot = join(tmp, "bb-worktrees");
    const other = join(bbRoot, "env_other", "beta");
    initRepo(other);
    commit(other, { "README.md": "base\n" }, "base");

    expect(bbWorktreeRoots([mainRepo], bbRoot)).toEqual([]);
    expect(scanWorkingCopies(root, PROJECT, [mainRepo], bbRoot).copies).toEqual([]);
  });

  it("BB 뿌리가 없어도 예외로 죽지 않는다 — BB 를 안 쓰는 기계는 빈 목록", () => {
    expect(bbWorktreeRoots([join(tmp, "projects", PROJECT)], join(tmp, "없는-뿌리"))).toEqual([]);
  });

  it("🔴 env 디렉토리 아래 이름만 같고 저장소가 아닌 폴더는 사본으로 세지 않는다", () => {
    const mainRepo = join(tmp, "projects", PROJECT);
    initRepo(mainRepo);
    git(mainRepo, "checkout", "-q", "-b", "main");
    commit(mainRepo, { "README.md": "base\n" }, "base");
    const bbRoot = join(tmp, "bb-worktrees");
    mkdirSync(join(bbRoot, "env_zzz", PROJECT), { recursive: true });

    expect(bbWorktreeRoots([mainRepo], bbRoot)).toEqual([]);
  });

  it("🔴 커밋 안 된 Time 기록(gootte start)도 처리중으로 잡힌다 — 커밋 없이 파일만 편집해도", () => {
    const mainRepo = join(tmp, "projects", PROJECT);
    initRepo(mainRepo);
    git(mainRepo, "checkout", "-q", "-b", "main");
    commit(mainRepo, { "README.md": "base\n" }, "base");
    const wt = join(mainRepo, ".claude", "worktrees", "fm-x");
    execFileSync("git", ["-C", mainRepo, "worktree", "add", "-q", "-b", "worktree-fm-x", wt], {
      stdio: "ignore",
    });
    // 🔴 gootte start/end 는 커밋하지 않는다 — working tree 만 편집한다. Time 줄이 커밋 이전에
    // 작업의 신호가 되어야 그 작업이 화면에서 사라지지 않는다(INV-4). Time(started=) 이 있으면
    // 처리중 판정(ADR 0001)은 그 기록으로 즉시 잡는다 — 커밋 여부와 무관하다.
    // main 프로젝트의 티켓 파일에 Time(started=) 을 쓴다(커밋 안 함) — readFeatures 가 이 내용을 읽는다.
    writeFileSync(
      join(mainRepo, "docs", "features", "auth", "issues", "02-screen.md"),
      startedTicketFile("02", "로그인 화면 v3"),
    );
    // worktree 쪽에도 같은 편집을 남긴다 — worktree 가 그 티켓을 건드리고 있음을 관측에 남긴다
    // (이 테스트의 요점은 "커밋 안 된 Time 기록" 이지 "미상 작업" 이 아니다).
    writeFileSync(
      join(wt, "docs", "features", "auth", "issues", "02-screen.md"),
      startedTicketFile("02", "로그인 화면 v3"),
    );

    const { features, inProgress } = observe(root, [mainRepo]);
    expect(ticketOf(features, "02-screen")?.status).toBe("in_progress");
    expect(inProgress.tickets).toBe(1);
    expect(inProgress.working).toBe(1);
    expect(inProgress.unknown).toEqual([]);
  });

  it("🔴 untracked(??) 티켓 파일은 처리중으로 만들지 않는다 — 새 파일 존재는 붙든 증거가 아니다", () => {
    // 새로 등록한 기능 폴더 전체가 아직 커밋 안 된 경우(git status `??`) — 파일이 있다는 것은
    // "지금 붙들고 있음"의 증거가 아니다(실제 결함 2026-09-01: jinwooauto worktree 의
    // live-state-display/T03.md 가 처리중으로 오판됐다). 처리중 여부는 Time 줄(started=)이 정한다.
    const mainRepo = join(tmp, "projects", PROJECT);
    initRepo(mainRepo);
    git(mainRepo, "checkout", "-q", "-b", "main");
    commit(mainRepo, { "README.md": "base\n" }, "base");
    const wt = join(mainRepo, ".claude", "worktrees", "fm-x");
    execFileSync("git", ["-C", mainRepo, "worktree", "add", "-q", "-b", "worktree-fm-x", wt], {
      stdio: "ignore",
    });
    // 관리대상(프로젝트)에는 이 기능이 없고, worktree 에만 untracked 로 존재한다
    mkdirSync(join(wt, "docs", "features", "billing", "tickets"), { recursive: true });
    writeFileSync(
      join(wt, "docs", "features", "billing", "tickets", "T01.md"),
      "# T01 — 청구서\n",
    );
    expect(
      execFileSync("git", ["-C", wt, "status", "--porcelain", "--untracked-files=all"], { encoding: "utf8" }),
    ).toContain("?? docs/features/billing/tickets/T01.md");

    const scan = scanWorkingCopies(root, PROJECT, [mainRepo]);
    const { features, inProgress } = applyInProgress(
      readFeatures([mainRepo, wt]), // 실제 백엔드는 withWorktrees 로 worktree 를 함께 읽는다
      scan,
    );
    const billing = features.find((f) => f.slug === "billing");
    expect(billing?.newTickets?.[0]?.status).toBe("pending");
    expect(inProgress.tickets).toBe(0);
    // worktree 는 branch 를 가진 working 이지만 티켓에 못 잇는다 → '티켓 미상 · 작업중' 으로 세는
    // 것은 설계대로다(새 파일 존재는 그 자체로 "붙들고 있음"의 증거가 아니다 — Time 줄이 증거다).
    expect(inProgress.unknown.map((u) => u.slug)).toContain("alpha/claude/fm-x");
  });
});

describe("정렬 — 처리중인 기능이 무리 안에서 위로 온다(티켓 03)", () => {
  /** `auth`(이미 있음) 보다 폴더명이 뒤인 두 번째 기능 — 정렬이 처리중을 보는지는 이걸로만 잡힌다. */
  function makeSecondFeature(): void {
    mkdirSync(join(project, "docs", "features", "billing", "issues"), { recursive: true });
    writeFileSync(
      join(project, "docs", "features", "billing", "spec.md"),
      "# billing\n\nStatus: draft\n",
    );
    writeFileSync(
      join(project, "docs", "features", "billing", "issues", "01-plan.md"),
      ticketFile("01", "요금제"),
    );
  }

  // 🔴 이 티켓의 진짜 일 — `readFeatures` 가 끝난 뒤에야 처리중이 얹히므로, 정렬이 그 사실을
  // 보려면 `applyInProgress` 를 거친 뒤의 결과라야 한다. `observe()` 가 정확히 그 전체 경로다.
  it("🔴 처리중인 티켓을 가진 기능이 폴더명 순서를 뒤집고 위로 온다", () => {
    makeSecondFeature();
    // billing 의 01-plan.md 에 Time(started=) 을 얹는다 — 처리중 판정 필요(ADR 0001).
    const billingDir = join(project, "docs", "features", "billing", "issues", "01-plan.md");
    writeFileSync(billingDir, startedTicketFile("01", "요금제"));
    makeCopy({
      slot: "1",
      branch: "fm/billing-plan",
      work: { "docs/features/billing/issues/01-plan.md": startedTicketFile("01", "요금제") },
    });

    const { features } = observe();
    expect(features.map((f) => f.slug)).toEqual(["billing", "auth"]); // "auth" < "billing" 인데도 뒤집힌다
    expect(features.find((f) => f.slug === "billing")?.tickets[0]?.status).toBe("in_progress");
  });

  it("처리중이 하나도 없으면 폴더명 순 그대로 — 회귀 고정(이 티켓의 안전선)", () => {
    makeSecondFeature();

    const { features } = observe();
    expect(features.map((f) => f.slug)).toEqual(["auth", "billing"]);
  });
});
