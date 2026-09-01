import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { readFeatures } from "@gootte/core-io";
import { recordProjectScan, revalidateSnapshot, snapshotPath } from "../src/snapshot";

// 🔴 이 저장소 자신의 docs/ 를 픽스처로 쓰지 않는다(verify gate 규율).
// HEAD 스탬프 게이팅(sameStamps)이 사본 HEAD 가 안 바뀌면 readFeatures 를 다시 부르지 않음을
// 실측한다 — git 하위프로세스 비용이 사본/프로젝트 수에 비례해 살아나는 것을 막는다(T05 AC4 · 비용 억제).

function initRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  execFileSync("git", ["init", "-q", dir], { stdio: "ignore" });
  execFileSync("git", ["-C", dir, "config", "user.email", "crew@example.com"], { stdio: "ignore" });
  execFileSync("git", ["-C", dir, "config", "user.name", "crew"], { stdio: "ignore" });
  execFileSync("git", ["-C", dir, "config", "commit.gpgsign", "false"], { stdio: "ignore" });
  execFileSync("git", ["-C", dir, "symbolic-ref", "HEAD", "refs/heads/main"], { stdio: "ignore" });
}
function commit(dir: string, msg: string): void {
  execFileSync("git", ["-C", dir, "add", "-A"], { stdio: "ignore" });
  execFileSync("git", ["-C", dir, "commit", "-q", "-m", msg], { stdio: "ignore" });
}

let dataDir: string;
let tmp: string;
let root: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "gootte-t05-"));
  tmp = mkdtempSync(join(tmpdir(), "gootte-t05-repo-"));
  root = tmp;
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(tmp, { recursive: true, force: true });
});

function makeProj(slug: string): string {
  const p = join(root, slug);
  mkdirSync(join(p, "docs", "features", slug), { recursive: true });
  writeFileSync(join(p, "AGENTS.md"), "x\n");
  writeFileSync(join(p, "docs", "features", slug, "spec.md"), `# ${slug}\n`);
  return p;
}
const scannedAt = (): string => JSON.parse(readFileSync(snapshotPath(dataDir), "utf8")).scannedAt;

describe("snapshot HEAD 스탬프 게이팅 — HEAD 미변화 사본은 재스캔 안 함(T05 비용 억제)", () => {
  test("사본 HEAD 가 안 바뀌고 작업트리도 깨끗하면 재검증해도 스냅샷이 갱신되지 않는다(캐시 히트 = 재스캔 안 함)", () => {
    const proj = makeProj("alpha");
    initRepo(proj);
    writeFileSync(join(proj, "docs", "features", "alpha", "spec.md"), "# alpha v1\n");
    commit(proj, "init");

    // 최초 스캔(요청 경로가 하는 일)을 직접 흉내 — 스냅샷 기록
    recordProjectScan(dataDir, { slug: "alpha", path: proj, copies: [proj] }, readFeatures([proj]));
    const at0 = scannedAt();

    // HEAD 동일 → 재스캔 안 함 → scannedAt 그대로(= recordProjectScan 재호출 안 함)
    const r2 = revalidateSnapshot(dataDir, [root]);
    expect(r2.changedProjects).toEqual([]);
    expect(scannedAt()).toBe(at0);

    // 🔴 미착지 변경(HEAD 미변화)도 이제 재스캔한다 — `gootte start/end/pause/resume` 은 커밋 없이
    // 티켓 파일만 편집하므로, HEAD 만 보면 Time: finished= 가 스냅샷에 반영되지 않아 완료/시작이
    // stale 로 남는다(INV-3, 실제 결함 2026-09-01). docs/features 아래 미커밋 변경은 캐시 히트가 아니다.
    writeFileSync(join(proj, "docs", "features", "alpha", "spec.md"), "# alpha v2 (uncommitted)\n");
    const r3 = revalidateSnapshot(dataDir, [root]);
    expect(r3.changedProjects).toContain("alpha");
    expect(scannedAt()).not.toBe(at0); // 재스캔했으니 갱신됐다
  });

  test("사본 HEAD 가 바뀌면(커밋) 재검증이 재스캔해서 스냅샷을 갱신한다(캐시 미스)", () => {
    const proj = makeProj("alpha");
    initRepo(proj);
    commit(proj, "init");
    recordProjectScan(dataDir, { slug: "alpha", path: proj, copies: [proj] }, readFeatures([proj]));
    const at0 = scannedAt();

    writeFileSync(join(proj, "docs", "features", "alpha", "spec.md"), "# alpha v2\n");
    commit(proj, "change"); // HEAD 변경

    const r = revalidateSnapshot(dataDir, [root]);
    expect(r.changedProjects).toContain("alpha");
    expect(scannedAt()).not.toBe(at0); // 재스캔했으니 갱신됐다
  });
});
