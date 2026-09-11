import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createApp, mountFallback } from "../src/app";

/** mountFallback 정적 서빙(backend-serves-ui T01) — flag off 기본, flag on + dist 때만 서빙. */
describe("mountFallback", () => {
  const prevServe = process.env.GOOTTE_SERVE_DIST;
  const prevDir = process.env.GOOTTE_DIST_DIR;
  let dist = "";
  let dataDir = "";

  afterEach(() => {
    if (prevServe === undefined) delete process.env.GOOTTE_SERVE_DIST;
    else process.env.GOOTTE_SERVE_DIST = prevServe;
    if (prevDir === undefined) delete process.env.GOOTTE_DIST_DIR;
    else process.env.GOOTTE_DIST_DIR = prevDir;
    if (dist) rmSync(dist, { recursive: true, force: true });
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dist = "";
    dataDir = "";
  });

  function makeDist(): string {
    dist = mkdtempSync(join(tmpdir(), "gootte-dist-"));
    writeFileSync(join(dist, "index.html"), "<!doctype html><div id=root></div>\n");
    mkdirSync(join(dist, "assets"), { recursive: true });
    writeFileSync(join(dist, "assets", "app.js"), "console.log(1)\n");
    process.env.GOOTTE_SERVE_DIST = "1";
    process.env.GOOTTE_DIST_DIR = dist;
    return dist;
  }

  function servedApp() {
    dataDir = mkdtempSync(join(tmpdir(), "gootte-serve-db-"));
    const app = createApp({ roots: [], dataDir });
    mountFallback(app);
    return app;
  }

  test("flag off → 기존 placeholder 그대로", async () => {
    const app = servedApp();
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("frontend 미빌드");
  });

  test("flag on + dist → `/`는 index.html, 에셋은 바이트 일치", async () => {
    makeDist();
    const app = servedApp();
    const root = await app.request("/");
    expect(root.status).toBe(200);
    expect(root.headers.get("content-type")).toContain("text/html");
    expect(await root.text()).toContain('<div id=root>');
    const js = await app.request("/assets/app.js");
    expect(js.status).toBe(200);
    expect(js.headers.get("content-type")).toContain("javascript");
    expect(await js.text()).toBe("console.log(1)\n");
  });

  test("`/api/*` 는 캐치올에 안 먹힌다(마운트 순서 회귀)", async () => {
    makeDist();
    const app = servedApp();
    const res = await app.request("/api/projects");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  test("dist 밖·없는 파일은 404", async () => {
    makeDist();
    const app = servedApp();
    expect((await app.request("/assets/없음.js")).status).toBe(404);
    expect((await app.request("/../app.ts")).status).toBe(404);
  });

  test("flag on + dist 없음 → placeholder 로 떨어진다", async () => {
    process.env.GOOTTE_SERVE_DIST = "1";
    process.env.GOOTTE_DIST_DIR = join(tmpdir(), "gootte-dist-없는-곳");
    const app = servedApp();
    expect(await (await app.request("/")).text()).toContain("frontend 미빌드");
  });
});
