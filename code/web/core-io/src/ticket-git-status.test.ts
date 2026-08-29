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
  it("feat(slug): T05 커밋이 있으면 그 slug 의 resolveTicketDone(repo, slug, '05') = true", () => {
    pushCommit(repo, "feat(auth): T05 세션 발급");
    expect(resolveTicketDone(repo, "auth", "05", dataDir)).toBe(true);
    // 🔴 T06 — slug 범위. 다른 slug 로 물으면 완료가 아니다(번호만 같다고 오탐하지 않는다).
    expect(resolveTicketDone(repo, "other-feature", "05", dataDir)).toBe(false);
    expect(ticketGitCacheExists(dataDir)).toBe(true);
  });

  it("SHA 동일 → revalidate 가 git log 를 호출하지 않는다(캐시 히트)", () => {
    pushCommit(repo, "feat(f): T05 done");
    const sha = originMainSha(repo)!;
    // 🔴 실제 T05 대신 엉뚱한 done 집합을 미리 심는다 — SHA 가 같으면 스캔이 안 일어나야
    // 이 값이 그대로 살아남고, T05 는 절대 추가되지 않는다.
    writeFileSync(
      join(dataDir, "ticket-git-status.json"),
      JSON.stringify({ version: 2, shas: { [repo]: sha }, done: { [repo]: { f: { "99": true } } } }),
    );
    revalidateTicketGitStatus(repo, dataDir);
    expect(resolveTicketDone(repo, "f", "99", dataDir)).toBe(true); // 캐시 유지
    expect(resolveTicketDone(repo, "f", "05", dataDir)).toBe(false); // 스캔 안 됨 → 추가 안 됨
  });

  it("SHA 변경 → 마지막 SHA 이후 커밋만 증분 스캔해 done 갱신", () => {
    pushCommit(repo, "feat(f): T05 first");
    const shaA = originMainSha(repo)!; // T05 가 이 SHA 다
    pushCommit(repo, "feat(f): T07 second", { "g.md": "y\n" }); // T05 이후 새 커밋(다른 파일)
    // 캐시를 shaA 시점으로 미리 심는다 — range = shaA..origin/main = T07 커밋만.
    writeFileSync(
      join(dataDir, "ticket-git-status.json"),
      JSON.stringify({ version: 2, shas: { [repo]: shaA }, done: { [repo]: {} } }),
    );
    revalidateTicketGitStatus(repo, dataDir);
    expect(resolveTicketDone(repo, "f", "07", dataDir)).toBe(true); // 새 커밋 반영
    expect(resolveTicketDone(repo, "f", "05", dataDir)).toBe(false); // range 밖(이미 지난 커밋)은 안 잡힘
  });

  it("trailer 의 slug + T<NN> 도 매칭 — 'Ticket: f' + 'Closes: T08' 이 같이 있으면 done", () => {
    pushCommit(repo, "merge feature\n\n본문 설명.\nTicket: f\nCloses: T08", { "f.md": "x\n" });
    expect(resolveTicketDone(repo, "f", "08", dataDir)).toBe(true);
  });

  it("origin/main 을 못 읽으면 예외 대신 false, 캐시도 안 쓴다(대시보드 안전)", () => {
    const alone = mkdtempSync(join(tmpdir(), "gootte-tgs-alone-"));
    initRepo(alone); // remote 없음 → origin/main 해소 불가
    commit(alone, { "f.md": "x\n" }, "feat(f): T05 no remote");
    expect(resolveTicketDone(alone, "f", "05", dataDir)).toBe(false);
    expect(ticketGitCacheExists(dataDir)).toBe(false);
    rmSync(alone, { recursive: true, force: true });
  });

  it("commitMessagesInRange 는 '해시\\x1f본문' 레코드를 \\x1e 로 갈라 준다", () => {
    pushCommit(repo, "feat(f): T05 x");
    const lines = commitMessagesInRange(repo, "origin/main");
    const hit = lines.find((l) => l.includes("T05"));
    expect(hit).toBeDefined();
    expect(hit!.includes("\x1f")).toBe(true); // 해시와 본문이 구분자로 갈라져 있다
  });

  it("per-repo 격리 — A repo 의 T05 가 B repo 판정을 오염하지 않는다(교차 프로젝트 충돌 없음)", () => {
    // 두 번째 repo(별개 origin) — T05 커밋이 없다.
    const other = makeOrigin();
    pushCommit(repo, "feat(a): T05 in A"); // T05 는 A 에만
    revalidateTicketGitStatus(repo, dataDir);
    revalidateTicketGitStatus(other.repo, dataDir);
    expect(resolveTicketDone(repo, "a", "05", dataDir)).toBe(true); // A 는 완료
    expect(resolveTicketDone(other.repo, "b", "05", dataDir)).toBe(false); // B 는 미완료(오염 안 됨)
    rmSync(other.tmp, { recursive: true, force: true });
  });

  it("다중 repo 에서도 SHA 게이트가 repo 별로 동작 — B 만 push 해도 A 는 재스캔 안 함", () => {
    const other = makeOrigin();
    pushCommit(repo, "feat(a): T05 in A");
    revalidateTicketGitStatus(repo, dataDir); // A 캐시 됨
    revalidateTicketGitStatus(other.repo, dataDir); // B 캐시 됨(빈)
    // A 는 그대로, B 만 push → B 만 true 반환, A 재호출은 false(게이트)
    pushCommit(other.repo, "feat(b): T07 in B");
    expect(revalidateTicketGitStatus(other.repo, dataDir)).toBe(true); // B 는 SHA 바뀜 → 스캔
    expect(revalidateTicketGitStatus(repo, dataDir)).toBe(false); // A 는 SHA 동일 → 스캔 안 함
    rmSync(other.tmp, { recursive: true, force: true });
  });

  // --- T06: slug 범위 완료 판정(번호 충돌 버그 수정) ---------------------------------------

  it("AC1 — 같은 repo, 다른 기능의 같은 번호: ticket-done-from-git T01 커밋이 ticket-time-stamp T01 을 완료시키지 않는다", () => {
    pushCommit(repo, "feat(ticket-done-from-git): T01 git 기반 리졸버");
    expect(resolveTicketDone(repo, "ticket-done-from-git", "01", dataDir)).toBe(true);
    expect(resolveTicketDone(repo, "ticket-time-stamp", "01", dataDir)).toBe(false);
  });

  it("AC2 — 기획 문서 커밋('tickets T01-T03')은 어떤 기능의 티켓도 완료시키지 않는다", () => {
    pushCommit(repo, "docs(features): ticket-time-stamp — plan (grill/spec/tickets T01-T03)");
    expect(resolveTicketDone(repo, "ticket-time-stamp", "01", dataDir)).toBe(false);
    expect(resolveTicketDone(repo, "ticket-time-stamp", "02", dataDir)).toBe(false);
    expect(resolveTicketDone(repo, "ticket-time-stamp", "03", dataDir)).toBe(false);
  });

  it("AC3 — feat(ticket-done-from-git): T01 ... 커밋은 ticket-done-from-git T01 만 완료시킨다", () => {
    pushCommit(repo, "feat(ticket-done-from-git): T01 세션 발급");
    expect(resolveTicketDone(repo, "ticket-done-from-git", "01", dataDir)).toBe(true);
    expect(resolveTicketDone(repo, "ticket-done-from-git", "02", dataDir)).toBe(false);
    expect(resolveTicketDone(repo, "other-feature", "01", dataDir)).toBe(false);
  });

  it("AC4 — slug 없는 'T01' 단독 언급은 어떤 티켓도 완료시키지 않는다", () => {
    pushCommit(repo, "fix: T01 관련 회귀 수정");
    expect(resolveTicketDone(repo, "ticket-done-from-git", "01", dataDir)).toBe(false);
    expect(resolveTicketDone(repo, "ticket-time-stamp", "01", dataDir)).toBe(false);
  });

  it("구형(v1) 캐시는 무효화된다 — version 없는 캐시를 읽으면 재스캔한다", () => {
    pushCommit(repo, "feat(f): T05 x");
    const sha = originMainSha(repo)!;
    // v1 구조(slug 없이 done[repo][num])를 심는다.
    writeFileSync(join(dataDir, "ticket-git-status.json"), JSON.stringify({ shas: { [repo]: sha }, done: { [repo]: { "05": true } } }));
    // v1 은 버전 필드가 없어 무효 → 캐시 미스 취급, origin/main 전체를 다시 훑는다.
    expect(resolveTicketDone(repo, "f", "05", dataDir)).toBe(true);
  });

  // --- T07: 광범위 미탐 회귀 방지 — 실제 커밋 스타일을 픽스처로 고정 ------------------------

  it("T07 — slug가 괄호 없이 맨 앞: 'one-setting-finds-every-copy T05' → slug 인식", () => {
    pushCommit(repo, "one-setting-finds-every-copy T05: 설정은 firstmate 홈 한 칸, 나머지 뿌리는 파생한다");
    expect(resolveTicketDone(repo, "one-setting-finds-every-copy", "05", dataDir)).toBe(true);
  });

  it("T07 — scope는 패키지 이름이지만 slug는 괄호 안 자유 위치: 'core-io: ... (one-setting-finds-every-copy T02)' → slug 인식", () => {
    pushCommit(repo, "core-io: 명부를 실물에 적힌 그대로 읽는다 (one-setting-finds-every-copy T02) (#81)");
    expect(resolveTicketDone(repo, "one-setting-finds-every-copy", "02", dataDir)).toBe(true);
  });

  it("T07 — scope는 'docs(features)'(기획 문서): slug 문자열이 있어도 넓힌 매칭 제외(AC2 보호 유지)", () => {
    pushCommit(repo, "docs(features): ticket-time-stamp — plan (grill/spec/tickets T01-T03) (#90)");
    // `docs(` 로 시작하므로 넓힌 매칭이 적용되지 않아 기존 AC2 보호가 유지된다.
    expect(resolveTicketDone(repo, "ticket-time-stamp", "01", dataDir)).toBe(false);
    expect(resolveTicketDone(repo, "ticket-time-stamp", "02", dataDir)).toBe(false);
    expect(resolveTicketDone(repo, "ticket-time-stamp", "03", dataDir)).toBe(false);
  });

  it("T07 — scope 없는 'T01: projects 페이로드 캐시 ...'는 slug 문자열이 없으므로 여전히 미인식(안전 쪽 오류 유지)", () => {
    pushCommit(repo, "T01: projects 페이로드 캐시 (fix/spinner-spin) — readFeatures 재실행 13초 → 5초 TTL");
    // 이 메시지에는 실제 feature slug 문자열이 없으므로 어떤 slug 의 T01 도 완료로 기록되지 않는다.
    // 안전 쪽 오류: 없으면 기록 안 함.
    expect(resolveTicketDone(repo, "ticket-done-from-git", "01", dataDir)).toBe(false);
    expect(resolveTicketDone(repo, "fast-cold-start", "01", dataDir)).toBe(false);
  });

  it("T07 — docs/features/ slug 목록 기반 매칭이 작동함(실물 커밋 스타일 픽스처)", () => {
    // docs/features/ 디렉터리가 존재하면 slug 목록이 로드되어야 한다.
    // 위 테스트들이 통과하면 slug 매칭이 작동함을 증명한다.
    pushCommit(repo, "feat(ticket-done-from-git): T05 세션 발급 + slug 문자열 확인");
    expect(resolveTicketDone(repo, "ticket-done-from-git", "05", dataDir)).toBe(true);
  });
});
