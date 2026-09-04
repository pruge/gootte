/**
 * read-path-redesign/T07 — **문서 클릭이 계산에 줄 서지 않는다** 를 지키는 가드.
 *
 * 🔴 이 파일이 이 티켓의 값어치다. 이것이 없으면 다음 사람이 요청 경로에 동기 계산을 다시
 * 얹는다 — 이 저장소가 정확히 그렇게 생겼었다(spec §4 원인 A).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createFeaturesCompute } from "../src/features-compute";

/** `code/web` — 자식 프로세스의 cwd 이자 스크립트를 둘 자리(모듈 해소가 거기 기준이다). */
const WEB_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

let tmp: string;
let repo: string;
let repo2: string;

/** 계산이 100ms 를 넘도록 충분히 큰 픽스처 — 그래야 "루프가 살아 있나" 가 의미 있는 질문이 된다. */
function makeBigProject(dir: string): void {
  mkdirSync(dir, { recursive: true });
  execFileSync("git", ["init", "-q", dir], { stdio: "ignore" });
  for (const c of [["user.email", "c@e.com"], ["user.name", "c"], ["commit.gpgsign", "false"]])
    execFileSync("git", ["-C", dir, "config", ...c], { stdio: "ignore" });
  for (let i = 0; i < 120; i++) {
    const d = join(dir, "docs", "features", `feature-${String(i).padStart(3, "0")}`);
    mkdirSync(join(d, "tickets"), { recursive: true });
    writeFileSync(join(d, "spec.md"), `# feature-${i}\n\nStatus: draft\n`);
    for (let t = 1; t <= 6; t++)
      writeFileSync(join(d, "tickets", `T0${t}.md`), `# T0${t} — t${t}\n\n**Blocked by:** 없음\n`);
  }
  execFileSync("git", ["-C", dir, "add", "-A"], { stdio: "ignore" });
  execFileSync("git", ["-C", dir, "commit", "-q", "-m", "i"], { stdio: "ignore" });
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "gootte-compute-"));
  repo = join(tmp, "proj");
  // 🔴 두 번째 사본은 **독립 저장소**로 만든다 — `git clone` 은 느슨한 객체를 하드링크/복사하다
  // 간헐적으로 깨졌다(실측: `fatal: failed to copy file ... No such file or directory`).
  // 필요한 것은 "캐시를 비켜 갈 두 번째 경로" 뿐이라 clone 일 이유가 없다.
  repo2 = join(tmp, "proj2");
  makeBigProject(repo);
  makeBigProject(repo2);
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

/**
 * 🔴 **워커 검사는 vitest 안에서 못 한다** — vitest 가 띄운 워커는 vitest 의 모듈 해소기도
 * `tsx` 로더도 못 받아 TS import 를 못 푼다(실측: `Cannot find module .../core-io/src/git`).
 * 그때 `features-compute` 는 설계대로 **인라인으로 내려앉는다** — 폴백이 제 일을 한 것이지
 * 결함이 아니다.
 *
 * 그래서 이 가드는 **실제 실행 방식 그대로** 자식 프로세스를 띄워 검사한다.
 * dev 는 `tsx watch src/server.ts`, Tauri 는 `node --import tsx src/server.ts` 다
 * (`backend/package.json` · `src-tauri/src/main.rs`) — 둘 다 `--import tsx` 경로다.
 */
function runInRealRuntime(script: string): string {
  const file = join(WEB_ROOT, `t07-probe-${process.pid}.mjs`);
  writeFileSync(file, script);
  try {
    return execFileSync("node", ["--import", "tsx", file], {
      cwd: WEB_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } finally {
    rmSync(file, { force: true });
  }
}

describe("features-compute — 계산이 요청 스레드를 막지 않는다 (T07)", () => {
  test("🔴 실제 실행 방식(`node --import tsx`)에서 **워커로** 뜬다 — 인라인 폴백으로 조용히 내려앉지 않는다", () => {
    const out = runInRealRuntime(`
      import { createFeaturesCompute } from "./backend/src/features-compute.ts";
      const c = createFeaturesCompute();
      const f = await c.run([${JSON.stringify(repo)}]);
      console.log(JSON.stringify({ mode: c.mode(), count: f.length }));
      await c.close();
    `);
    const r = JSON.parse(out.trim().split("\n").pop()!) as { mode: string; count: number };
    expect(r.count).toBe(120);
    // 🔴 폴백은 **안전장치이지 정상 동작이 아니다.** 여기서 "inline" 이 나오면 실제 앱에서
    // 워커가 안 뜬다는 뜻이고, 그러면 T07 의 성질(줄 안 섬)이 성립하지 않는다.
    expect(r.mode).toBe("worker");
  }, 60_000);

  test("🔴 AC1 — 계산이 도는 **동안** 이벤트 루프가 살아 있다(문서 요청이 그 뒤에 서지 않는다)", () => {
    const out = runInRealRuntime(`
      import { createFeaturesCompute } from "./backend/src/features-compute.ts";
      const c = createFeaturesCompute();
      await c.run([${JSON.stringify(repo)}]);        // 워커를 데운다(첫 스폰 비용 제외)
      let ticks = 0;
      const iv = setInterval(() => ticks++, 5);
      const t0 = Date.now();
      await c.run([${JSON.stringify(repo)}, ${JSON.stringify(repo2)}]);
      const took = Date.now() - t0;
      clearInterval(iv);
      console.log(JSON.stringify({ mode: c.mode(), took, ticks }));
      await c.close();
    `);
    const r = JSON.parse(out.trim().split("\n").pop()!) as { mode: string; took: number; ticks: number };
    expect(r.mode).toBe("worker");
    // 계산이 실제로 걸렸는데도 루프가 그동안 여러 번 돌았다 = 요청은 기다리지 않는다.
    expect(r.took).toBeGreaterThan(30);
    expect(r.ticks).toBeGreaterThan(3);
  }, 60_000);

  test("워커를 닫아도 계산은 계속된다 — 인라인으로 내려앉을 뿐 판을 죽이지 않는다(INV-U1)", async () => {
    const c = createFeaturesCompute();
    await c.run([repo]);
    await c.close();
    // 닫힌 뒤에도 답은 나와야 한다(느릴 뿐).
    const again = await c.run([repo]);
    expect(again.length).toBe(120);
  });
});
