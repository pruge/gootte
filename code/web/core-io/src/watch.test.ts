import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { watchProjects, type Change, type ProjectWatcher } from "./watch";

const TICKET = join("docs", "features", "f", "issues", "01-x.md");

function makeProject(root: string, slug: string): void {
  const p = join(root, slug);
  mkdirSync(join(p, "docs", "features", "f", "issues"), { recursive: true });
  writeFileSync(join(p, "AGENTS.md"), "# AGENTS\n");
  writeFileSync(join(p, TICKET), "# 01 — x\n\n**Status:** ready-for-agent\n");
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) return;
    await sleep(30);
  }
  throw new Error("waitFor timeout");
}

describe("watchProjects (022)", () => {
  let w: ProjectWatcher | null = null;
  let root = "";
  let sock: Server | null = null;
  afterEach(async () => {
    await w?.close();
    w = null;
    if (sock) await new Promise<void>((r) => sock!.close(() => r()));
    sock = null;
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
  });

  it("문서 변경 → {project}, 새 프로젝트 → {projects}", async () => {
    root = mkdtempSync(join(tmpdir(), "gootte-watch-"));
    makeProject(root, "alpha");
    const events: Change[] = [];
    w = watchProjects([root], (c) => events.push(c), { debounceMs: 40 });
    await sleep(500); // chokidar ready

    // 1) 문서 변경 → {project: alpha}
    writeFileSync(join(root, "alpha", TICKET), "# 01 — x\n\n**Status:** resolved (2026-08-09)\n");
    await waitFor(() => events.some((e) => e.kind === "project" && e.project === "alpha"));

    // 2) 새 프로젝트(beta) 추가 → {projects}
    makeProject(root, "beta");
    await waitFor(() => events.some((e) => e.kind === "projects"));

    // 3) beta 문서 변경 → {project: beta} (재동기된 감시)
    const before = events.length;
    writeFileSync(join(root, "beta", TICKET), "x");
    await waitFor(() => events.slice(before).some((e) => e.kind === "project" && e.project === "beta"));
  });

  /**
   * 🔴 회귀 고정 — 실측 크래시: 저장소 루트의 `.codegraph/daemon.sock`(유닉스 소켓)을 watch 하려다
   * macOS 가 UNKNOWN 을 냈고, chokidar 의 `error` 를 아무도 듣지 않아 uncaught 로 다시 던져져
   * 백엔드가 통째로 내려갔다. 색인 디렉토리는 애초에 걷지 않고, 그래도 못 붙는 경로가 있으면
   * 서버는 살아 있어야 한다 — 감시가 죽는 것과 서버가 죽는 것은 다른 사건이다.
   */
  it("색인 디렉토리의 유닉스 소켓이 있어도 감시가 죽지 않는다", async () => {
    root = mkdtempSync(join(tmpdir(), "gootte-watch-"));
    makeProject(root, "alpha");
    const codegraph = join(root, "alpha", ".codegraph");
    mkdirSync(codegraph, { recursive: true });
    sock = createServer();
    await new Promise<void>((r) => sock!.listen(join(codegraph, "daemon.sock"), r));

    const events: Change[] = [];
    w = watchProjects([root], (c) => events.push(c), { debounceMs: 40 });
    await sleep(500); // chokidar ready — 고치기 전이라면 여기서 프로세스가 죽었다

    // 살아 있을 뿐 아니라 계속 일한다 — 소켓 하나 때문에 감시가 조용히 멎으면 뷰가 stale 해진다(INV-3).
    writeFileSync(join(root, "alpha", TICKET), "# 01 — x\n\n**Status:** resolved (2026-08-09)\n");
    await waitFor(() => events.some((e) => e.kind === "project" && e.project === "alpha"));
  });

  /**
   * 감시 범위는 `docs/features/` 다 — `docs/` 아래 다른 것은 제품이 읽지 않으므로(그 경로 하나뿐)
   * 감시해도 다시 계산될 뷰가 없다. 넓게 걸면 무관한 문서 저장마다 전 클라이언트에 push 가 나간다.
   */
  it("docs/features 밖의 docs 변경은 이벤트를 내지 않는다", async () => {
    root = mkdtempSync(join(tmpdir(), "gootte-watch-"));
    makeProject(root, "alpha");
    mkdirSync(join(root, "alpha", "docs", "agents"), { recursive: true });
    const events: Change[] = [];
    w = watchProjects([root], (c) => events.push(c), { debounceMs: 40 });
    // 🔴 정착까지 기다린 뒤 기준선을 0 으로 — 픽스처가 감시 직전에 쓴 파일이 awaitWriteFinish 에
    // 걸려 뒤늦게 change 로 올라온다. 그것을 세면 "무엇이 이벤트를 내는가" 가 아니라 픽스처를 재게 된다.
    await sleep(700);
    events.length = 0;

    writeFileSync(join(root, "alpha", "docs", "agents", "note.md"), "관례 문서 — 제품이 읽지 않는다\n");
    await sleep(400);
    expect(events).toEqual([]);

    // 같은 프로젝트의 티켓은 여전히 잡힌다 — 좁힌 것이지 끈 것이 아니다.
    writeFileSync(join(root, "alpha", TICKET), "# 01 — x\n\n**Status:** resolved (2026-08-09)\n");
    await waitFor(() => events.some((e) => e.kind === "project" && e.project === "alpha"));
  });

  /**
   * 목록 감시는 뿌리 아래 **두 칸까지**의 프로젝트를 본다(`discoverProjects` 와 같은 범위).
   * 얕은 쪽만 맞추고 끝내면 컨테이너 아래 프로젝트가 조용히 안 뜬다.
   */
  it("컨테이너 한 칸 아래(<root>/<container>/<proj>)의 새 프로젝트도 자동 추가된다", async () => {
    root = mkdtempSync(join(tmpdir(), "gootte-watch-"));
    makeProject(root, "seed");
    const events: Change[] = [];
    w = watchProjects([root], (c) => events.push(c), { debounceMs: 40 });
    await sleep(500);

    makeProject(root, join("container", "deep"));
    await waitFor(() => events.some((e) => e.kind === "projects"));
  });

  /**
   * 🔴 목록 감시는 **프로젝트 내부로 들어가지 않는다** — 발견 표식의 부모만 보면 되기 때문이다.
   * 들어가면 감시 대상이 프로젝트 크기에 비례해 늘고(fd 한계), 그 walk 이 `.codegraph/daemon.sock`
   * 같은 지뢰를 밟는다. 내부 파일 변경으로 목록 재조회가 나가지 않는 것으로 그 사실을 고정한다.
   */
  it("프로젝트 내부 깊은 곳의 변경은 목록 재조회를 부르지 않는다", async () => {
    root = mkdtempSync(join(tmpdir(), "gootte-watch-"));
    makeProject(root, "alpha");
    mkdirSync(join(root, "alpha", "code", "web", "src"), { recursive: true });
    const events: Change[] = [];
    w = watchProjects([root], (c) => events.push(c), { debounceMs: 40 });
    // 정착까지 기다린 뒤 기준선을 0 으로 — 픽스처가 감시 직전에 쓴 파일이 awaitWriteFinish 에
    // 걸려 뒤늦게 올라온다. 그것을 세면 감시 범위가 아니라 픽스처를 재게 된다.
    await sleep(700);
    events.length = 0;

    writeFileSync(join(root, "alpha", "code", "web", "src", "app.ts"), "export const x = 1;\n");
    await sleep(400);
    expect(events).toEqual([]);
  });

  it("close 후 이벤트 무발화", async () => {
    root = mkdtempSync(join(tmpdir(), "gootte-watch-"));
    makeProject(root, "alpha");
    const events: Change[] = [];
    w = watchProjects([root], (c) => events.push(c), { debounceMs: 40 });
    await sleep(500);
    await w.close();
    w = null;
    const n = events.length;
    writeFileSync(join(root, "alpha", TICKET), "changed");
    await sleep(300);
    expect(events.length).toBe(n);
  });

  /**
   * 🔴 T01 — 같은 slug 의 사본이 둘 있으면 discover 가 하나로 묶는다. 묶인 결과 위에서 감시기는
   * **모든 사본**의 docs 를 보고, 어느 사본에서 바뀌어도 `projectOf` 가 같은 slug 로 접는다
   * (수용 기준 4). 대표 경로가 첫 뿌리의 사본이므로 두 번째 뿌리의 변경도 같은 slug 로 온다.
   */
  it("같은 slug 사본 둘 — 어느 사본의 문서 변경도 같은 slug 로 접힌다", async () => {
    root = mkdtempSync(join(tmpdir(), "gootte-watch-"));
    const other = mkdtempSync(join(tmpdir(), "gootte-watch-other-"));
    makeProject(root, "dup");
    makeProject(other, "dup");
    const events: Change[] = [];
    w = watchProjects([root, other], (c) => events.push(c), { debounceMs: 40 });
    await sleep(500);
    events.length = 0;

    // 두 번째 뿌리(비대표) 사본의 문서 변경 → {project: dup} (같은 slug 로 접힘).
    writeFileSync(join(other, "dup", TICKET), "# 01 — x\n\n**Status:** resolved (2026-08-09)\n");
    await waitFor(() => events.some((e) => e.kind === "project" && e.project === "dup"));
  });
});

// ── read-path-redesign/T05 — 감시 축 둘 ────────────────────────────────────────
describe("watchProjects — worktree 와 커밋도 본다 (read-path-redesign/T05)", () => {
  let w: ProjectWatcher | null = null;
  let root = "";
  afterEach(async () => {
    await w?.close();
    w = null;
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
  });

  const git = (dir: string, ...args: string[]): void => {
    execFileSync("git", ["-C", dir, ...args], { stdio: "ignore" });
  };
  const initRepo = (dir: string): void => {
    execFileSync("git", ["init", "-q", dir], { stdio: "ignore" });
    for (const c of [["user.email", "c@e.com"], ["user.name", "c"], ["commit.gpgsign", "false"]])
      git(dir, "config", ...(c as string[]));
  };

  it("🔴 Claude Code worktree 안의 **커밋 안 된 새 티켓**이 잡힌다 — 예전에는 어느 경로로도 안 잡혔다", async () => {
    root = mkdtempSync(join(tmpdir(), "gootte-watch-wt-"));
    const proj = join(root, "alpha");
    makeProject(root, "alpha");
    initRepo(proj);
    git(proj, "add", "-A");
    git(proj, "commit", "-q", "-m", "i");
    const wt = join(proj, ".claude", "worktrees", "fm-x");
    mkdirSync(join(proj, ".claude", "worktrees"), { recursive: true });
    execFileSync("git", ["-C", proj, "worktree", "add", "-q", "-b", "fm-x", wt], { stdio: "ignore" });

    const seen: Change[] = [];
    w = watchProjects([root], (c) => seen.push(c), { debounceMs: 20 });
    await sleep(300);
    seen.length = 0;

    // worktree 안에 **커밋하지 않은** 새 티켓을 만든다.
    mkdirSync(join(wt, "docs", "features", "f", "tickets"), { recursive: true });
    writeFileSync(join(wt, "docs", "features", "f", "tickets", "T09.md"), "# T09 — 새 티켓\n");

    await waitFor(() => seen.some((c) => c.kind === "project" && c.project === "alpha"));
  });

  it("🔴 커밋(HEAD 변경)이 잡힌다 — 갈라짐 판정이 커밋으로 바뀌기 때문(축 2, T06 조사)", async () => {
    root = mkdtempSync(join(tmpdir(), "gootte-watch-git-"));
    const proj = join(root, "alpha");
    makeProject(root, "alpha");
    initRepo(proj);
    git(proj, "add", "-A");
    git(proj, "commit", "-q", "-m", "i");

    const seen: Change[] = [];
    w = watchProjects([root], (c) => seen.push(c), { debounceMs: 20 });
    await sleep(300);
    seen.length = 0;

    // 🔴 `docs/features` **밖** 파일만 커밋한다 — 축 1(문서 감시)이 못 보는 변경이어야
    // 축 2(커밋 감시)가 일한다는 것이 증명된다.
    writeFileSync(join(proj, "README.md"), "x\n");
    git(proj, "add", "-A");
    git(proj, "commit", "-q", "-m", "unrelated");

    await waitFor(() => seen.some((c) => c.kind === "project" && c.project === "alpha"));
  });
});

describe("watchProjects — 감시 시작 *뒤에* 생긴 워크트리 (a-new-worktree-is-seen-at-once/T01)", () => {
  let w: ProjectWatcher | null = null;
  let root = "";
  let bbRoot = "";
  const prevBb = process.env.GOOTTE_BB_WORKTREES;
  afterEach(async () => {
    await w?.close();
    w = null;
    if (prevBb === undefined) delete process.env.GOOTTE_BB_WORKTREES;
    else process.env.GOOTTE_BB_WORKTREES = prevBb;
    for (const d of [root, bbRoot]) if (d) rmSync(d, { recursive: true, force: true });
    root = "";
    bbRoot = "";
  });

  const git = (dir: string, ...args: string[]): void => {
    execFileSync("git", ["-C", dir, ...args], { stdio: "ignore" });
  };
  const initRepo = (dir: string): void => {
    execFileSync("git", ["init", "-q", dir], { stdio: "ignore" });
    for (const c of [["user.email", "c@e.com"], ["user.name", "c"], ["commit.gpgsign", "false"]])
      git(dir, "config", ...(c as string[]));
  };
  const ticketIn = (wt: string, name: string): void => {
    mkdirSync(join(wt, "docs", "features", "f", "tickets"), { recursive: true });
    writeFileSync(join(wt, "docs", "features", "f", "tickets", name), `# ${name}\n`);
  };

  it("🔴 BB worktree 가 **감시 시작 뒤에** 생겨도 그 안의 티켓 편집이 잡힌다", async () => {
    root = mkdtempSync(join(tmpdir(), "gootte-wt-bb-"));
    bbRoot = mkdtempSync(join(tmpdir(), "gootte-bbroot-"));
    process.env.GOOTTE_BB_WORKTREES = bbRoot;
    const proj = join(root, "alpha");
    makeProject(root, "alpha");
    initRepo(proj);
    git(proj, "add", "-A");
    git(proj, "commit", "-q", "-m", "i");

    const seen: Change[] = [];
    w = watchProjects([root], (c) => seen.push(c), { debounceMs: 20 });
    await sleep(400);
    seen.length = 0;

    // ── 여기서부터가 이 테스트의 전부다: 감시가 이미 돌고 있는 상태에서 worktree 를 만든다.
    const envDir = join(bbRoot, "env_test01");
    mkdirSync(envDir, { recursive: true });
    const wt = join(envDir, "alpha");
    execFileSync("git", ["-C", proj, "worktree", "add", "-q", "-b", "bb-x", wt], { stdio: "ignore" });
    await sleep(300); // 재바인딩이 돌 시간
    seen.length = 0;

    ticketIn(wt, "T77.md");
    await waitFor(() => seen.some((c) => c.kind === "project" && c.project === "alpha"));
  });

  it("🔴 Claude Code worktree 도 감시 시작 뒤에 생기면 잡힌다(컨테이너가 아직 없던 경우 포함)", async () => {
    root = mkdtempSync(join(tmpdir(), "gootte-wt-cc-"));
    const proj = join(root, "alpha");
    makeProject(root, "alpha");
    initRepo(proj);
    git(proj, "add", "-A");
    git(proj, "commit", "-q", "-m", "i");

    const seen: Change[] = [];
    w = watchProjects([root], (c) => seen.push(c), { debounceMs: 20 });
    await sleep(400);
    seen.length = 0;

    // `.claude/worktrees` 자체가 아직 없다 — 그것이 생기는 것부터 봐야 한다.
    const wt = join(proj, ".claude", "worktrees", "fm-late");
    mkdirSync(join(proj, ".claude", "worktrees"), { recursive: true });
    execFileSync("git", ["-C", proj, "worktree", "add", "-q", "-b", "fm-late", wt], { stdio: "ignore" });
    await sleep(300);
    seen.length = 0;

    ticketIn(wt, "T78.md");
    await waitFor(() => seen.some((c) => c.kind === "project" && c.project === "alpha"));
  });

  // ⚠️ **이것은 회귀 가드가 아니라 성질 기록이다.** 구현을 되돌리고 돌려도 통과한다 —
  // 지워진 디렉토리의 감시는 chokidar 가 OS 수준에서 이미 놓기 때문이다(실측 2026-09-04).
  // `rebindCopies` 의 `unwatch` 는 그래서 **관측되는 동작이 아니라 장부 정리**다.
  // 그래도 남긴다: 재바인딩이 죽은 경로를 다시 붙이는 회귀는 이 테스트가 잡는다.
  it("worktree 가 사라진 자리는 조용하다 — 재바인딩이 죽은 경로를 되살리지 않는다", async () => {
    root = mkdtempSync(join(tmpdir(), "gootte-wt-gone-"));
    bbRoot = mkdtempSync(join(tmpdir(), "gootte-bbgone-"));
    process.env.GOOTTE_BB_WORKTREES = bbRoot;
    const proj = join(root, "alpha");
    makeProject(root, "alpha");
    initRepo(proj);
    git(proj, "add", "-A");
    git(proj, "commit", "-q", "-m", "i");
    const envDir = join(bbRoot, "env_gone");
    mkdirSync(envDir, { recursive: true });
    const wt = join(envDir, "alpha");
    execFileSync("git", ["-C", proj, "worktree", "add", "-q", "-b", "bb-gone", wt], { stdio: "ignore" });

    // worktree 를 감시 시작 **전에** 만들어 둔다 — 지워지기 전에 실제로 감시되던 경로여야 한다.
    const seen: Change[] = [];
    w = watchProjects([root], (c) => seen.push(c), { debounceMs: 20 });
    await sleep(400);

    execFileSync("git", ["-C", proj, "worktree", "remove", "--force", wt], { stdio: "ignore" });
    await sleep(400);
    seen.length = 0;

    // 같은 자리에 **저장소가 아닌** 평범한 폴더를 세워 문서를 쓴다. 사본이 아니므로 조용해야 한다.
    mkdirSync(join(wt, "docs", "features", "f", "tickets"), { recursive: true });
    writeFileSync(join(wt, "docs", "features", "f", "tickets", "T79.md"), "# T79\n");
    await sleep(500);
    expect(seen.filter((c) => c.kind === "project")).toEqual([]);
  });
});
