import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { StorageResponse } from "@gootte/contract";
import { folderCacheSize, readFeatures } from "@gootte/core-io";
import { createApp } from "../src/app";

/** 저장소 라우트(settings-storage-meter) — 측정·비우기 계약. */
describe("storage routes", () => {
  const prevOverride = process.env.GOOTTE_WEBKIT_DATA_DIR;
  let fixture = "";
  let dataDir = "";

  afterEach(() => {
    if (prevOverride === undefined) delete process.env.GOOTTE_WEBKIT_DATA_DIR;
    else process.env.GOOTTE_WEBKIT_DATA_DIR = prevOverride;
    if (fixture) rmSync(fixture, { recursive: true, force: true });
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    fixture = "";
    dataDir = "";
  });

  function makeFixture(): string {
    fixture = mkdtempSync(join(tmpdir(), "gootte-storage-"));
    writeFileSync(join(fixture, "a.bin"), Buffer.alloc(1000));
    mkdirSync(join(fixture, "sub"), { recursive: true });
    writeFileSync(join(fixture, "sub", "b.bin"), Buffer.alloc(500));
    process.env.GOOTTE_WEBKIT_DATA_DIR = fixture;
    return fixture;
  }

  test("GET /api/storage — 픽스처 합산과 일치한다", async () => {
    makeFixture();
    dataDir = mkdtempSync(join(tmpdir(), "gootte-storage-db-"));
    const app = createApp({ roots: [], dataDir });
    const body = StorageResponse.parse(await (await app.request("/api/storage")).json());
    expect(body.totalBytes).toBe(1500);
  });

  test("경로가 없으면 null 로 죽지 않는다", async () => {
    process.env.GOOTTE_WEBKIT_DATA_DIR = join(tmpdir(), "gootte-storage-없는-곳");
    dataDir = mkdtempSync(join(tmpdir(), "gootte-storage-db-"));
    const app = createApp({ roots: [], dataDir });
    const res = await app.request("/api/storage");
    expect(res.status).toBe(200);
    expect(StorageResponse.parse(await res.json()).totalBytes).toBeNull();
  });

  test("POST /api/storage/clear — 폴더 캐시가 비워져 다음 read 가 재계산한다", async () => {
    makeFixture();
    dataDir = mkdtempSync(join(tmpdir(), "gootte-storage-db-"));
    // 폴더 캐시에 뭔가를 앉힌다 — 관리대상 흉내(AGENTS.md + docs/features).
    const proj = mkdtempSync(join(tmpdir(), "gootte-storage-proj-"));
    try {
      writeFileSync(join(proj, "AGENTS.md"), "# p\n");
      mkdirSync(join(proj, "docs", "features", "f"), { recursive: true });
      writeFileSync(join(proj, "docs", "features", "f", "spec.md"), "# f\n");
      expect(readFeatures([proj]).length).toBe(1);
      expect(folderCacheSize()).toBeGreaterThan(0);
      const app = createApp({ roots: [], dataDir });
      const res = await app.request("/api/storage/clear", { method: "POST" });
      expect(res.status).toBe(200);
      expect(folderCacheSize()).toBe(0);
      // 비운 뒤에도 같은 값을 다시 읽는다 — 파생물이라 지우는 것만으로 충분하다(INV-1).
      expect(readFeatures([proj]).length).toBe(1);
    } finally {
      rmSync(proj, { recursive: true, force: true });
    }
  });
});
