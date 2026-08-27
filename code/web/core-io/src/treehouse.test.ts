import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyInProgress } from "@gootte/core";
import { readFeatures } from "./features";
import { scanWorkingCopies } from "./treehouse";

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
function observe(scanRoot = root) {
  return applyInProgress(readFeatures([project]), scanWorkingCopies(scanRoot, PROJECT));
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
  it("작업 가지의 커밋이 티켓 파일을 건드리면 그 티켓이 처리중", () => {
    makeCopy({
      slot: "1",
      branch: "fm/alpha-login-screen", // 🔴 이름에는 티켓 번호가 없다 — 이름으로 잇지 않는다
      work: { "docs/features/auth/issues/02-screen.md": ticketFile("02", "로그인 화면") },
    });

    const { features, inProgress } = observe();
    expect(ticketOf(features, "02-screen")?.status).toBe("in_progress");
    expect(ticketOf(features, "02-screen")?.workedBy).toEqual(["fm/alpha-login-screen"]);
    expect(ticketOf(features, "01-session")?.status).toBe("pending");
    expect(inProgress).toMatchObject({ rootExists: true, copies: 1, working: 1, tickets: 1 });
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
    const work = { "docs/features/auth/issues/02-screen.md": ticketFile("02", "로그인 화면") };
    makeCopy({ slot: "1", branch: "fm/a", work });
    makeCopy({ slot: "2", branch: "fm/b", work });

    const { features, inProgress } = observe();
    expect(inProgress.tickets).toBe(1); // 티켓 하나
    expect(inProgress.working).toBe(2); // 사본 둘 — 둘 다 보인다
    expect(ticketOf(features, "02-screen")?.workedBy).toEqual(["fm/a", "fm/b"]);
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
    writeFileSync(join(dir, "01-환불.md"), ticketFile("01", "환불"));
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
    makeCopy({
      slot: "1",
      branch: "fm/a",
      work: { "docs/features/auth/issues/01-session.md": ticketFile("01", "세션 발급") },
    });
    makeCopy({
      slot: "2",
      branch: "fm/b",
      work: { "docs/features/auth/issues/02-screen.md": ticketFile("02", "로그인 화면") },
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
    makeCopy({
      slot: "1",
      branch: "fm/no-remote",
      work: { "docs/features/auth/issues/01-session.md": ticketFile("01", "세션 발급") },
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
    makeCopy({
      slot: "1",
      branch: "fm/billing-plan",
      work: { "docs/features/billing/issues/01-plan.md": ticketFile("01", "요금제") },
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
