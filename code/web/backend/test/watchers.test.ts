import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { ChangeEvent } from "@gootte/contract";
import { migratePlanDb, type ProjectWatcher } from "@gootte/core-io";
import { createApp } from "../src/app";
import { clearDiscoverCache } from "../src/discover-cache";
import { startWatchers, type Watchers } from "../src/watchers";

const NO_TREEHOUSE = join(tmpdir(), "gootte-watchers-no-treehouse");

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) return;
    await sleep(30);
  }
  throw new Error("waitFor timeout");
}

/** 티켓 파일 한 장 — 상단 두 줄이 서식의 전부다(관리대상 `docs/agents/triage-labels.md`). */
const ticket = (num: string, status: string): string =>
  [`# ${num} — 티켓 ${num}`, "", "**Blocked by:** 없음 — 즉시 착수 가능", `**Status:** ${status}`, ""].join("\n");

/** 관리대상 하나를 임시 디렉토리에 합성한다 — 뿌리 `AGENTS.md` + `docs/features/`(discover 조건). */
function makeProject(root: string, slug: string, feature: string, tickets: Record<string, string>): string {
  const projectRoot = join(root, slug);
  const issuesDir = join(projectRoot, "docs", "features", feature, "issues");
  mkdirSync(issuesDir, { recursive: true });
  writeFileSync(join(projectRoot, "AGENTS.md"), `# ${slug}\n`);
  writeFileSync(join(projectRoot, "docs", "features", feature, "spec.md"), `# ${feature} — 제목\n`);
  for (const [file, body] of Object.entries(tickets)) writeFileSync(join(issuesDir, file), body);
  return projectRoot;
}

/**
 * 배선(server.ts 에서 꺼낸 `startWatchers`) 검증 — plan-board/09, 🔴 첫 커버.
 * 감시기 자체(파일 변경 감지·디바운스 뭉침)는 `plan-watch.test.ts`·`watch.test.ts` 가 이미 덮었다 —
 * 여기서 보는 것은 **서버가 그 감시기를 만들어 신호로 잇는가**뿐이다(spec F2).
 */
describe("startWatchers", () => {
  let root = "";
  let dataDir = "";
  let watchers: Watchers | null = null;

  afterEach(async () => {
    await watchers?.close();
    watchers = null;
    if (root) rmSync(root, { recursive: true, force: true });
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    root = "";
    dataDir = "";
    clearDiscoverCache();
  });

  test("계획 파일이 바뀌면 \"계획이 바뀌었다\" 가 방송된다 — 서버 밖에서 바뀌는 경우와 같은 길", async () => {
    root = mkdtempSync(join(tmpdir(), "gootte-watchers-"));
    dataDir = mkdtempSync(join(tmpdir(), "gootte-watchers-db-"));
    makeProject(root, "alpha", "shipped", {});
    const events: ChangeEvent[] = [];
    watchers = startWatchers({ roots: [root], dataDir, onChange: (e) => events.push(e) });
    await sleep(300); // chokidar ready

    migratePlanDb(dataDir);
    await waitFor(() => events.some((e) => e.kind === "plan"));
  });

  test("서버를 내리면 감시기들이 함께 닫힌다", async () => {
    // 🔴 실제 fs 감시기로 "닫은 뒤 이벤트가 안 나오는가"를 재는 것은 감시기 자체를 다시 재는
    // 일이다(이미 덮여 있다 — 위 주석). 여기서 잴 것은 배선 하나: close() 가 **전부** 부르는가.
    // 그래서 가짜 감시기를 주입해 fs 없이, 결정적으로 잰다.
    let projectsClosed = false;
    let planClosed = false;
    let backlogClosed = false;
    watchers = startWatchers({
      roots: [],
      dataDir: "",
      firstmateHome: "/tmp/어딘가",
      onChange: () => {},
      watchProjectsImpl: () => ({
        async close() {
          projectsClosed = true;
        },
      }),
      watchPlanDbImpl: () => ({
        async close() {
          planClosed = true;
        },
      }),
      watchBacklogImpl: () => ({
        async close() {
          backlogClosed = true;
        },
      }),
    });

    await watchers.close();

    expect(projectsClosed).toBe(true);
    expect(planClosed).toBe(true);
    expect(backlogClosed).toBe(true);
  });

  /**
   * tauri-desktop-app T03 — 감시 불가 → 폴백 폴러 신호. 실제 chokidar 오류를 강제하기는
   * 비결정적이므로, 가짜 감시기 주입으로 onError 배선만 결정적으로 잰다(위 close 테스트와 같은 원칙).
   * 가짜는 주입 경계(type)를 통과하는 최소 형태만 지킨다.
   */
  describe("폴백 신호 (tauri-desktop-app T03)", () => {
    /** opts.onError 를 밖에서 부를 수 있게 잡아 둔 문서 감시기 가짜. */
    const errorFiringProjects = (): {
      impl: typeof import("@gootte/core-io").watchProjects;
      emitError: () => void;
    } => {
      let captured: ((label: string, err: unknown) => void) | null = null;
      const impl = ((_roots: string[], _onChange: unknown, opts: { onError?: (label: string, err: unknown) => void }): ProjectWatcher => {
        captured = opts.onError ?? null;
        return { async close() {} };
      }) as unknown as typeof import("@gootte/core-io").watchProjects;
      return { impl, emitError: () => captured?.("콘텐츠", new Error("강제 실패")) };
    };

    test("감시 실패(onError) → watch-fallback active 방송, 되풀이 안 함", () => {
      const events: ChangeEvent[] = [];
      const p = errorFiringProjects();
      watchers = startWatchers({
        roots: [],
        dataDir,
        onChange: (e) => events.push(e),
        watchProjectsImpl: p.impl,
        watchPlanDbImpl: () => ({ async close() {} }),
      });

      p.emitError();
      p.emitError(); // 두 번 망가져도 소식은 한 번뿐이다 — 방송 홍수 방지

      expect(events.filter((e) => e.kind === "watch-fallback")).toEqual([
        { kind: "watch-fallback", active: true },
      ]);
    });

    test("재묶음(rebind) 성공 → active:false 로 회복 통보", async () => {
      const events: ChangeEvent[] = [];
      const p = errorFiringProjects();
      watchers = startWatchers({
        roots: [],
        dataDir,
        onChange: (e) => events.push(e),
        watchProjectsImpl: p.impl,
        watchPlanDbImpl: () => ({ async close() {} }),
      });
      p.emitError();

      await watchers.rebind([]);

      expect(events.filter((e) => e.kind === "watch-fallback")).toEqual([
        { kind: "watch-fallback", active: true },
        { kind: "watch-fallback", active: false },
      ]);
    });

    test("firstmate 홈 재묶음도 폴백을 회복시킨다", async () => {
      const events: ChangeEvent[] = [];
      const p = errorFiringProjects();
      watchers = startWatchers({
        roots: [],
        dataDir,
        onChange: (e) => events.push(e),
        watchProjectsImpl: p.impl,
        watchPlanDbImpl: () => ({ async close() {} }),
      });
      p.emitError();

      await watchers.rebindBacklog(null);

      expect(
        events.filter((e) => e.kind === "watch-fallback").map((e) => (e as { active: boolean }).active),
      ).toEqual([true, false]);
    });

    test("폴백 없던 평시엔 watch-fallback 을 방송하지 않는다", async () => {
      const events: ChangeEvent[] = [];
      dataDir = mkdtempSync(join(tmpdir(), "gootte-watchers-db-"));
      watchers = startWatchers({
        roots: [],
        dataDir,
        firstmateHome: null,
        onChange: (e) => events.push(e),
      });
      await sleep(300);

      expect(events.filter((e) => e.kind === "watch-fallback")).toEqual([]);
    });
  });

  test(
    "🔴 gootte 가 스스로 카드를 닫아도 방송은 한 번뿐 — 읽다가 쓰는 고리가 두 번째 읽기에서 끝난다",
    async () => {
      root = mkdtempSync(join(tmpdir(), "gootte-watchers-"));
      dataDir = mkdtempSync(join(tmpdir(), "gootte-watchers-db-"));
      makeProject(root, "beta", "shipped", {
        "01-a.md": ticket("01", "resolved (2026-08-08)"),
        "02-b.md": ticket("02", "resolved (2026-08-09)"),
      });
      const events: ChangeEvent[] = [];
      watchers = startWatchers({ roots: [root], dataDir, onChange: (e) => events.push(e) });
      await sleep(300);

      const app = createApp({
        roots: [root],
        treehouse: NO_TREEHOUSE,
        dataDir,
        now: () => "2026-08-12 17:40",
      });

      await app.request("/api/plan/beta"); // 처음 본다 — 자동 닫힘이 area=완료 를 쓴다(04)
      await waitFor(() => events.filter((e) => e.kind === "plan").length === 1);

      await app.request("/api/plan/beta"); // 두 번째 — 이미 닫혔으니 쓸 것이 없다
      await sleep(400); // 디바운스보다 넉넉히 기다려도 더 늘지 않는다
      expect(events.filter((e) => e.kind === "plan").length).toBe(1);
    },
  );
});
