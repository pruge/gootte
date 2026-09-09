import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { readFeatures } from "@gootte/core-io";
import { recordProjectScan, revalidateSnapshot, snapshotPath } from "../src/snapshot";

// 🔴 이 저장소 자신의 docs/ 를 픽스처로 쓰지 않는다(verify gate 규율).
// sameCopies 게이팅이 사본 구성이 안 바뀌면 readFeatures 를 다시 부르지 않음을
// 실측한다 — 비용이 사본/프로젝트 수에 비례해 살아나는 것을 막는다(T05 AC4 · 비용 억제).

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

/** 지정한 부모 아래에 프로젝트를 만든다 — 같은 slug 의 두 번째 사본용(다른 경로). */
function makeProjIn(parent: string, slug: string): string {
  const p = join(parent, slug);
  mkdirSync(join(p, "docs", "features", slug), { recursive: true });
  writeFileSync(join(p, "AGENTS.md"), "x\n");
  writeFileSync(join(p, "docs", "features", slug, "spec.md"), `# ${slug}\n`);
  return p;
}
const scannedAt = (): string => JSON.parse(readFileSync(snapshotPath(dataDir), "utf8")).scannedAt;

describe("snapshot sameCopies 게이팅 — 사본 구성 미변화는 재스캔 안 함(T05 비용 억제)", () => {
  test("사본 구성이 같으면 재검증해도 스냅샷이 갱신되지 않는다(캐시 히트 = 재스캔 안 함)", async () => {
    const proj = makeProj("alpha");

    // 최초 스캔(요청 경로가 하는 일)을 직접 흉내 — 스냅샷 기록
    recordProjectScan(dataDir, { slug: "alpha", path: proj, copies: [proj] }, readFeatures([proj]));
    const at0 = scannedAt();

    // copies 동일 → 재스캔 안 함 → scannedAt 그대로(= recordProjectScan 재호출 안 함)
    const r2 = await revalidateSnapshot(dataDir, [root]);
    expect(r2.changedProjects).toEqual([]);
    expect(scannedAt()).toBe(at0);

    // 문서 내용을 바꿔도 copies가 같으면 재스캔하지 않는다 — sameCopies만 판정 기준
    writeFileSync(join(proj, "docs", "features", "alpha", "spec.md"), "# alpha v2\n");
    const r3 = await revalidateSnapshot(dataDir, [root]);
    expect(r3.changedProjects).toEqual([]);
    expect(scannedAt()).toBe(at0);
  });

  test("새 사본(copies 변경)이 붙으면 재검증이 재스캔해서 스냅샷을 갱신한다(캐시 미스)", async () => {
    const proj = makeProj("alpha");
    recordProjectScan(dataDir, { slug: "alpha", path: proj, copies: [proj] }, readFeatures([proj]));
    const at0 = scannedAt();

    // 새 worktree 사본 추가 — 같은 slug, **다른 경로**(depth 2 스캔이 잡는 자리).
    const copyDir = join(root, "sub");
    mkdirSync(copyDir, { recursive: true });
    const proj2 = makeProjIn(copyDir, "alpha");
    const r = await revalidateSnapshot(dataDir, [root]);
    expect(r.changedProjects).toContain("alpha");
    expect(scannedAt()).not.toBe(at0); // 재스캔했으니 갱신됐다
  });
});
