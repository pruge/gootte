import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { ChangeEvent } from "@gootte/contract";
import { fetchOrigin, resolveTicketDone, ticketGitCacheExists } from "@gootte/core-io";
import { createSnapshotRevalidator } from "../src/snapshot-revalidator";

// 🔴 이 저장소 자신의 docs/ 를 픽스처로 쓰지 않는다 — 임시 디렉토리에 합성한다(verify gate 규율).

function git(repo: string, ...args: string[]): void {
  execFileSync("git", ["-C", repo, ...args], { stdio: "ignore" });
}
function initRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  execFileSync("git", ["init", "-q", dir], { stdio: "ignore" });
  git(dir, "symbolic-ref", "HEAD", "refs/heads/main");
  git(dir, "config", "user.email", "crew@example.com");
  git(dir, "config", "user.name", "crew");
  git(dir, "config", "commit.gpgsign", "false");
}
function commit(repo: string, files: Record<string, string>, msg: string): void {
  for (const [p, c] of Object.entries(files)) {
    const full = join(repo, p);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, c);
    git(repo, "add", p);
  }
  git(repo, "commit", "-q", "-m", msg);
}

/** bare origin + 첫mate 프로젝트 clone. `root`=[tmp] 면 discover 가 clone 을 l1 에서 잡는다. */
function makeFirstmateClone(): { tmp: string; repo: string; root: string } {
  const tmp = mkdtempSync(join(tmpdir(), "gootte-t02-"));
  const bare = join(tmp, "bare.git");
  execFileSync("git", ["init", "-q", "--bare", bare], { stdio: "ignore" });
  git(bare, "symbolic-ref", "HEAD", "refs/heads/main");
  const repo = join(tmp, "proj"); // 첫mate 프로젝트(AGENTS.md + docs/features)
  initRepo(repo);
  writeFileSync(join(repo, "AGENTS.md"), "x\n");
  mkdirSync(join(repo, "docs", "features"), { recursive: true });
  writeFileSync(join(repo, "docs", "features", "spec.md"), "x\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "init");
  git(repo, "remote", "add", "origin", bare);
  git(repo, "push", "-q", "origin", "main");
  git(repo, "fetch", "-q", "origin");
  return { tmp, repo, root: tmp };
}

let dataDir: string;
let tmp: string;
let repo: string;
let root: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "gootte-t02-cache-"));
  const o = makeFirstmateClone();
  tmp = o.tmp;
  repo = o.repo;
  root = o.root;
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(tmp, { recursive: true, force: true });
});

describe("snapshot-revalidator — T02 배경 트리거 + origin fetch", () => {
  test("캡틴이 push 하면(T05) 재검증 tick 에 리졸버 캐시 갱신 → 화면 알림(projects)", () => {
    const events: ChangeEvent[] = [];
    const rev = createSnapshotRevalidator({
      dataDir,
      roots: () => [root],
      onChange: (e) => events.push(e),
    });

    rev.run(); // 첫 tick — origin/main = init 커밋, T05 없음
    expect(resolveTicketDone(repo, "proj", "05", dataDir)).toBe(false);
    expect(ticketGitCacheExists(dataDir)).toBe(true); // 캐시는 최초 1회 생성됨

    // 캡틴 push — origin 에 T05 커밋 착지
    commit(repo, { "f.md": "x\n" }, "feat(auth): T05 세션 발급");
    git(repo, "push", "-q", "origin", "main");
    git(repo, "fetch", "-q", "origin");

    rev.run(); // 다음 tick — fetch 가 origin/main 을 따라가고 리졸버가 갱신된다
    expect(resolveTicketDone(repo, "proj", "05", dataDir)).toBe(true);
    expect(events.some((e) => e.kind === "ticket")).toBe(true); // 화면에 알림(전용 kind, 검토 3)
  });

  test("origin/main 불변 → 리졸버 미호출(재스캔 없음), 완료 판정 그대로", () => {
    const rev = createSnapshotRevalidator({
      dataDir,
      roots: () => [root],
      onChange: () => {},
    });
    rev.run();
    expect(resolveTicketDone(repo, "proj", "05", dataDir)).toBe(false);

    // push 없이 재검증만 한 번 더 — SHA 불변이므로 git log 0회, 판정 변함없음
    rev.run();
    expect(resolveTicketDone(repo, "proj", "05", dataDir)).toBe(false);
  });

  test("remote 없는 사본에 fetchOrigin 해도 no-op(기동 막지 않음) + 리졸버 미갱신", () => {
    const alone = mkdtempSync(join(tmpdir(), "gootte-t02-alone-"));
    initRepo(alone);
    commit(alone, { "README.md": "x\n" }, "feat: T05 no remote");
    expect(() => fetchOrigin(alone)).not.toThrow(); // remote 없음 → no-op
    expect(resolveTicketDone(alone, "f", "05", dataDir)).toBe(false); // 리졸버 미호출
    expect(ticketGitCacheExists(dataDir)).toBe(false);
    rmSync(alone, { recursive: true, force: true });
  });
});
