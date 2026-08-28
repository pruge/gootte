import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import { FeaturesResponse, ProjectsResponse, type Feature, type Project } from "@gootte/contract";
import { readFeatures } from "@gootte/core-io";
import type { CopyScan } from "@gootte/core";
import { createApp } from "../src/app";
import { clearDiscoverCache, clearDiscoverCacheMemory } from "../src/discover-cache";
import { clearSnapshot, clearInProgressMemory, recordInProgress, recordProjectScan, snapshotFeatures, snapshotInProgress, snapshotNeedsRefresh, snapshotPath } from "../src/snapshot";

// 🔴 이 저장소 자신의 docs/ 를 픽스처로 쓰지 않는다 — 임시 디렉토리에 합성한다(verify gate 규율).
const FIXTURES = join(import.meta.dirname, "fixtures", "roots");
const NO_TREEHOUSE = join(FIXTURES, "..", "no-treehouse");

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "gootte-snapshot-"));
  clearDiscoverCache(); // 메모리 스냅샷이 흐르지 않게 각 시험 전에 완전히 비운다
  return () => rmSync(dataDir, { recursive: true, force: true });
});

const alphaLike = (overrides: Partial<Project> = {}): Project => ({
  slug: "alpha",
  path: join(FIXTURES, "alpha"),
  copies: [join(FIXTURES, "alpha")],
  ...overrides,
});

describe("snapshot 저장소 (fast-cold-start T03)", () => {
  test("기록한 스캔을 같은 사본 구성으로 읽는다 — 내용은 readFeatures 결과 그대로", () => {
    const proj = alphaLike();
    const features = readFeatures(proj.copies);
    recordProjectScan(dataDir, proj, features);

    const hit = snapshotFeatures(dataDir, "alpha", proj.copies);
    expect(hit).not.toBeNull();
    expect(hit).toEqual(features); // verbatim — 가공 없다(INV-4)
  });

  test("스탬프가 사본 경로와 headCommit 와 함께 디스크에 남는다", () => {
    const proj = alphaLike();
    recordProjectScan(dataDir, proj, readFeatures(proj.copies));

    const doc = JSON.parse(readFileSync(snapshotPath(dataDir), "utf8"));
    expect(doc.version).toBe(1);
    expect(doc.projects).toHaveLength(1);
    expect(doc.projects[0].stamps).toEqual([{ repo: proj.copies[0], head: null }]); // fixture 는 repo 가 아니라 null
  });

  test("사본 구성이 달라져도 slug 가 있으면 저장값을 바로 준다(stale-while-validate, T07)", () => {
    const proj = alphaLike();
    recordProjectScan(dataDir, proj, readFeatures(proj.copies));

    // 사본이 더 붙어도 slug 가 같으면 저장값을 즉시 서빙 — 빈 화면을 막는다
    const hit = snapshotFeatures(dataDir, "alpha", [...proj.copies, "/다른/사본"]);
    expect(hit).not.toBeNull();
    expect(hit).toEqual(readFeatures(proj.copies));
    // slug 가 없거나 파일이 없으면 미스 = 스캔 필요
    expect(snapshotFeatures(dataDir, "다른-slug", proj.copies)).toBeNull();
    expect(snapshotFeatures("/완전히/다른/dataDir", "alpha", proj.copies)).toBeNull();
    // 갱신 필요 여부는 별도 판정 — 사본 구성 차이면 true, 같으면 false
    expect(snapshotNeedsRefresh(dataDir, "alpha", [...proj.copies, "/다른/사본"])).toBe(true);
    expect(snapshotNeedsRefresh(dataDir, "alpha", proj.copies)).toBe(false);
  });

  test("같은 slug 재기록은 덮고 다른 slug 는 보존한다(upsert)", () => {
    recordProjectScan(dataDir, alphaLike(), []);
    recordProjectScan(dataDir, alphaLike({ slug: "beta", path: "/b", copies: ["/b"] }), []);

    const doc = JSON.parse(readFileSync(snapshotPath(dataDir), "utf8"));
    expect(doc.projects.map((p: { slug: string }) => p.slug)).toEqual(["alpha", "beta"]);

    recordProjectScan(dataDir, alphaLike(), [{ slug: "x" } as unknown as Feature]);
    const after = JSON.parse(readFileSync(snapshotPath(dataDir), "utf8"));
    expect(after.projects.map((p: { slug: string }) => p.slug)).toEqual(["alpha", "beta"]);
    expect(after.projects.find((p: { slug: string }) => p.slug === "alpha").features).toEqual([{ slug: "x" }]);
  });

  test("깨진 스냅샷 파일은 오류가 아니라 '스캔해야 한다' — null 로 흡수된다(INV-1)", () => {
    writeFileSync(snapshotPath(dataDir), "{ 깨진 내용 !!");

    expect(snapshotFeatures(dataDir, "alpha", alphaLike().copies)).toBeNull();
  });

  test("clearSnapshot 은 디스크까지 지운다 — 남아 있으면 다음 적재가 낡은 값을 꺼낸다", () => {
    const proj = alphaLike();
    recordProjectScan(dataDir, proj, readFeatures(proj.copies));

    clearSnapshot();

    expect(snapshotFeatures(dataDir, "alpha", proj.copies)).toBeNull();
  });
});

describe("라우트가 스냅샷에서 서빙한다 (재부팅 시나리오)", () => {
  // "재부팅" = 새 앱 인스턴스 + 스냅샷 메모리 비움(파일이 SoT, 메모리는 적재본).
  // 프로젝트 문서를 지운 뒤에도 기록 시점 기능 목록이 서빙되면 디스크 스냅샷에서 온 것이다.
  test("문서가 사라져도 스냅샷에 기록된 기능이 즉시 서빙된다 — git 0건", async () => {
    const root = mkdtempSync(join(tmpdir(), "gootte-roots-"));
    const roots = [root];
    mkdirSync(join(root, "alpha/docs/features/auth-login/issues"), { recursive: true });
    writeFileSync(join(root, "alpha/AGENTS.md"), "agent\n");
    writeFileSync(join(root, "alpha/docs/features/auth-login/spec.md"), "# auth-login\n\n## Goal\n\n로그인.\n");

    const app1 = createApp({ roots, treehouse: NO_TREEHOUSE, dataDir });
    await app1.request("/api/projects"); // 스캔 → 영구 기록
    expect(snapshotFeatures(dataDir, "alpha", [join(root, "alpha")])).not.toBeNull();

    rmSync(join(root, "alpha/docs/features/auth-login"), { recursive: true }); // 문서 소멸
    clearDiscoverCacheMemory(); // 재부팅: 메모리 비움(감시 신호 없이 낡은 기록이 못 남게 하는 같은 규율)

    const app2 = createApp({ roots, treehouse: NO_TREEHOUSE, dataDir });
    const body = FeaturesResponse.parse(await (await app2.request("/api/features/alpha")).json());
    expect(body.features.map((f) => f.slug)).toContain("auth-login"); // 디스크는 이미 비었는데 뜬다 = 스냅샷 서빙

    const list = ProjectsResponse.parse(await (await app2.request("/api/projects")).json());
    expect(list.projects.find((p) => p.slug === "alpha")).toBeDefined();
  });

  test("스냅샷 없는 첫 실행은 스캔해서 답하고 그 자리에서 기록한다", async () => {
    const app = createApp({ roots: [FIXTURES], treehouse: NO_TREEHOUSE, dataDir });
    const body = ProjectsResponse.parse(await (await app.request("/api/projects")).json());
    expect(body.projects.map((p) => p.slug)).toContain("alpha");
    expect(snapshotFeatures(dataDir, "alpha", [join(FIXTURES, "alpha")])).not.toBeNull(); // 곧장 영구 기록됐다
  });
});

describe("처리중 관측 스냅샷(T07 — features/plan/steps 탭 재기동 유지)", () => {
  test("기록하면 디스크에 남고, 메모리 캐시를 비워도(sim 재기동) 디스크에서 즉시 서빙된다", () => {
    const scan = { copies: [], stampedAt: "2026-08-13T00:00:00.000Z" } as unknown as CopyScan;
    recordInProgress(dataDir, "beta", scan);
    expect(snapshotInProgress(dataDir, "beta")).toEqual(scan); // 디스크에 있다
    clearInProgressMemory(); // 재기동: 메모리 비움
    expect(snapshotInProgress(dataDir, "beta")).toEqual(scan); // 디스크에서 즉시 복원 — 빈 화면 금지
    expect(snapshotInProgress(dataDir, "other")).toBeNull(); // 없는 slug 는 미스
  });

  test("upsert — 같은 slug 재기록은 덮고 다른 slug 는 보존한다", () => {
    recordInProgress(dataDir, "beta", { a: 1 } as unknown as CopyScan);
    recordInProgress(dataDir, "gamma", { b: 2 } as unknown as CopyScan);
    recordInProgress(dataDir, "beta", { a: 9 } as unknown as CopyScan);
    expect(snapshotInProgress(dataDir, "beta")).toEqual({ a: 9 });
    expect(snapshotInProgress(dataDir, "gamma")).toEqual({ b: 2 });
  });
});
