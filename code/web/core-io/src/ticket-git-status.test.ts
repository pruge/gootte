import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commitMessagesInRange, originMainSha } from "./git";
import { resolveTicketDone, revalidateTicketGitStatus, ticketGitCacheExists } from "./ticket-git-status";

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
function commit(repo: string, files: Record<string, string>, msg: string): void {
  for (const [p, c] of Object.entries(files)) {
    const full = join(repo, p);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, c);
    git(repo, "add", p);
  }
  git(repo, "commit", "-q", "-m", msg);
}

/** bare origin 을 둔 저장소 — push 하면 `origin/main` 이 생긴다. */
function makeOrigin(): { tmp: string; repo: string } {
  const tmp = mkdtempSync(join(tmpdir(), "gootte-tgs-"));
  const bare = join(tmp, "bare.git");
  execFileSync("git", ["init", "-q", "--bare", bare], { stdio: "ignore" });
  git(bare, "symbolic-ref", "HEAD", "refs/heads/main");
  const repo = join(tmp, "repo");
  initRepo(repo);
  commit(repo, { "README.md": "x\n" }, "init");
  git(repo, "remote", "add", "origin", bare);
  git(repo, "push", "-q", "origin", "main");
  git(repo, "fetch", "-q", "origin");
  return { tmp, repo };
}
/** origin/main 을 한 커밋 앞으로 민다(push + fetch). */
function pushCommit(repo: string, msg: string, files: Record<string, string> = { "f.md": "x\n" }): void {
  commit(repo, files, msg);
  git(repo, "push", "-q", "origin", "main");
  git(repo, "fetch", "-q", "origin");
}

let tmp: string;
let repo: string;
let dataDir: string;

beforeEach(() => {
  const o = makeOrigin();
  tmp = o.tmp;
  repo = o.repo;
  dataDir = mkdtempSync(join(tmpdir(), "gootte-tgs-cache-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  rmSync(dataDir, { recursive: true, force: true });
});

describe("ticket-git-status — T01 리졸버", () => {
  it("origin/main 에 T05 커밋이 있으면 resolveTicketDone(repo, slug, '05') = true", () => {
    pushCommit(repo, "feat(auth): T05 세션 발급");
    expect(resolveTicketDone(repo, "auth", "05", dataDir)).toBe(true);
    // 🔴 slug 는 git 신호에 안 들어간다(grill D3) — 다른 slug 로 물어도 같은 판정.
    expect(resolveTicketDone(repo, "other-feature", "05", dataDir)).toBe(true);
    expect(ticketGitCacheExists(dataDir)).toBe(true);
  });

  it("SHA 동일 → revalidate 가 git log 를 호출하지 않는다(캐시 히트)", () => {
    pushCommit(repo, "feat: T05 done");
    const sha = originMainSha(repo)!;
    // 🔴 실제 T05 대신 엉뚱한 done 집합을 미리 심는다 — SHA 가 같으면 스캔이 안 일어나야
    // 이 값이 그대로 살아남고, T05 는 절대 추가되지 않는다.
    writeFileSync(join(dataDir, "ticket-git-status.json"), JSON.stringify({ originMainSha: sha, done: { "99": true } }));
    revalidateTicketGitStatus(repo, dataDir);
    expect(resolveTicketDone(repo, "f", "99", dataDir)).toBe(true); // 캐시 유지
    expect(resolveTicketDone(repo, "f", "05", dataDir)).toBe(false); // 스캔 안 됨 → 추가 안 됨
  });

  it("SHA 변경 → 마지막 SHA 이후 커밋만 증분 스캔해 done 갱신", () => {
    pushCommit(repo, "feat: T05 first");
    const shaA = originMainSha(repo)!; // T05 가 이 SHA 다
    pushCommit(repo, "feat: T07 second", { "g.md": "y\n" }); // T05 이후 새 커밋(다른 파일)
    // 캐시를 shaA 시점으로 미리 심는다 — range = shaA..origin/main = T07 커밋만.
    writeFileSync(join(dataDir, "ticket-git-status.json"), JSON.stringify({ originMainSha: shaA, done: {} }));
    revalidateTicketGitStatus(repo, dataDir);
    expect(resolveTicketDone(repo, "f", "07", dataDir)).toBe(true); // 새 커밋 반영
    expect(resolveTicketDone(repo, "f", "05", dataDir)).toBe(false); // range 밖(이미 지난 커밋)은 안 잡힘
  });

  it("전체 본문(trailer)의 T<NN> 도 매칭 — 'Closes: T08' 만 있어도 done", () => {
    pushCommit(repo, "merge feature\n\n본문 설명.\nCloses: T08", { "f.md": "x\n" });
    expect(resolveTicketDone(repo, "f", "08", dataDir)).toBe(true);
  });

  it("origin/main 을 못 읽으면 예외 대신 false, 캐시도 안 쓴다(대시보드 안전)", () => {
    const alone = mkdtempSync(join(tmpdir(), "gootte-tgs-alone-"));
    initRepo(alone); // remote 없음 → origin/main 해소 불가
    commit(alone, { "f.md": "x\n" }, "feat: T05 no remote");
    expect(resolveTicketDone(alone, "f", "05", dataDir)).toBe(false);
    expect(ticketGitCacheExists(dataDir)).toBe(false);
    rmSync(alone, { recursive: true, force: true });
  });

  it("commitMessagesInRange 는 '해시\\x1f본문' 레코드를 \\x1e 로 갈라 준다", () => {
    pushCommit(repo, "feat: T05 x");
    const lines = commitMessagesInRange(repo, "origin/main");
    const hit = lines.find((l) => l.includes("T05"));
    expect(hit).toBeDefined();
    expect(hit!.includes("\x1f")).toBe(true); // 해시와 본문이 구분자로 갈라져 있다
  });
});
