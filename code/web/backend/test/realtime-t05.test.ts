import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { FeaturesResponse, type Feature } from "@gootte/contract";
import { finalizeFeatureStatus } from "@gootte/core";
import { joinTimeRecords, readFeatures } from "@gootte/core-io";
import { runTimeCommand } from "@gootte/cli";
import { createApp } from "../src/app";
import { createLiveHub, type LiveSocket } from "../src/live";
import { clearDiscoverCache } from "../src/discover-cache";
import { startWatchers, type Watchers } from "../src/watchers";
import { createProjectUpdateScheduler, recordProjectScan, snapshotFeatures } from "../src/snapshot";

// 🔴 이 저장소 자신의 docs/ 를 픽스처로 쓰지 않는다(verify gate 규율).
// 실시간 갱신 공백(캡틴 실측 2026-08-29): `gootte end` 로 레코드를 기록한 직후 화면이
// 수동 새로고침 없이 "완료" 로 바뀌는지 — 감시기 → 증분 갱신 스케줄러 → 스냅샷 갱신 → 같은
// `project` 이벤트 방송 → app 이 새 값을 서빙하는 전체 왕복을 잰다.
// 구관례 완전 정리 뒤 `gootte end` 는 문서가 아니라 `.gootte/state.json` 을 쓴다 —
// 감시기가 보는 것도 그 파일이다(core-io watch.ts state.json 감시).

const NO_TREEHOUSE = join(tmpdir(), "gootte-t05-no-treehouse");
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred: () => Promise<boolean> | boolean, timeoutMs = 6000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await pred()) return;
    await sleep(30);
  }
  throw new Error("waitFor timeout");
}

/** 관리대상 하나를 임시 디렉토리에 합성 — `docs/features/<feature>/tickets/T04.md`(신관례). */
function makeProject(root: string, slug: string, feature: string, ticketBody: string): string {
  const projRoot = join(root, slug);
  const ticketsDir = join(projRoot, "docs", "features", feature, "tickets");
  mkdirSync(ticketsDir, { recursive: true });
  writeFileSync(join(projRoot, "AGENTS.md"), `# ${slug}\n`);
  writeFileSync(join(projRoot, "docs", "features", feature, "spec.md"), `# ${feature} — 제목\n`);
  writeFileSync(join(ticketsDir, "T04.md"), ticketBody);
  return projRoot;
}

describe("realtime — 레코드 기록 → 증분 갱신 → 스냅샷 갱신 → 같은 project 이벤트 방송 (T05)", () => {
  let root = "";
  let rootB = "";
  let dataDir = "";
  let watchers: Watchers | null = null;

  afterEach(async () => {
    await watchers?.close();
    watchers = null;
    if (root) rmSync(root, { recursive: true, force: true });
    if (rootB) rmSync(rootB, { recursive: true, force: true });
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    clearDiscoverCache();
  });

  test("gootte 로 레코드를 기록하면 갱신 후 방송이 새 값(done)을 싣고, 화면이 즉시 반영된다", async () => {
    root = mkdtempSync(join(tmpdir(), "gootte-t05-rt-"));
    dataDir = mkdtempSync(join(tmpdir(), "gootte-t05-rt-db-"));
    const projRoot = makeProject(root, "alpha", "work", "# T04 — 티켓\n"); // 시작엔 레코드 없음
    const copies = [projRoot];
    // 🔴 `.gootte/` 를 미리 만든다 — state 감시기가 디렉토리를 걸어야 state.json 생성을
    // 잡는다(미생성 경로를 못 보는 chokidar 실측 한계, core-io watch.ts). 실전에서는 첫
    // 읽기가 state.json 을 만들어 이미 존재하므로 감시가 붙어 있다.
    mkdirSync(join(projRoot, ".gootte"), { recursive: true });

    const hub = createLiveHub();
    // 방송을 잡는다. 각 `project` alpha 방송 시점에 서빙될 스냅샷 상태를 동기로 찍는다 —
    // 즉시 방송은 아직 낡은 스냅샷(pending)을, 갱신 후 방송은 새 값(done)을 싣는지 본다.
    const servedAtBroadcast: string[] = [];
    // 스냅샷은 raw readFeatures 출력 — 캡처 시 레코드 조인+확정을 거쳐 실제 서빙 상태를 본다.
    const servedStatus = (): string => {
      const snap = snapshotFeatures(dataDir, "alpha", copies);
      if (!snap) return "none";
      return finalizeFeatureStatus(joinTimeRecords(snap, projRoot), "2026-08-30T00:00:00Z")[0]?.newTickets?.[0]?.status ?? "none";
    };
    const client: LiveSocket = {
      send: (d) => {
        if (d.includes('"kind":"project"') && d.includes('"alpha"')) {
          servedAtBroadcast.push(servedStatus());
        }
      },
    };
    hub.add(client);

    const app = createApp({ roots: [root], treehouse: NO_TREEHOUSE, dataDir });
    // 최초 스캔 흉내 — 스냅샷 기록(Time: 없음 → pending)
    recordProjectScan(dataDir, { slug: "alpha", path: projRoot, copies }, readFeatures(copies));

    const scheduler = createProjectUpdateScheduler({ dataDir, roots: () => [root], broadcast: hub.broadcast });
    watchers = startWatchers({
      roots: [root],
      dataDir,
      onChange: (c) => {
        if (c.kind === "project") scheduler.schedule(c.project);
        hub.broadcast(c);
      },
    });
    await sleep(300); // chokidar ready

    // 🔴 진짜 `gootte end` — 레코드 경로(문서가 아니라 state.json 에 쓴다).
    // runTimeCommand 를 cwd=프로젝트로 직접 부른다: CLI·버튼·번들이 모두 이 함수로 수렴한다.
    runTimeCommand(["start", "work", "T04", "--at", "2026-08-29T10:00:00+09:00"], projRoot);
    runTimeCommand(["end", "work", "T04", "--at", "2026-08-29T11:00:00+09:00"], projRoot);

    // 화면이 갱신될 때까지 대기(수동 새로고침 없이)
    // 🔴 API(done)는 레코드 조인을 곧바로 보므로 방송보다 빠르다 — 방송 도착도 따로 기다린다.
    await waitFor(async () => {
      const body = FeaturesResponse.parse(await (await app.request("/api/features/alpha")).json());
      return body.features[0]?.newTickets?.[0]?.status === "done";
    });

    // 방송이 실제로 나갔다(프론트가 invalidate 할 신호) — debounce 뒤에 도착한다.
    // 🔴 내용은 단언하지 않는다: servedStatus 가 조인하는 레코드는 디스크에서 곧바로 보여서,
    // 첫 즉시 방송도 이미 done 으로 찍힌다. 스냅샷이 시간 진실을 싣던 시절의 pending→done
    // 아크는 구조상 사라졌다(스냅샷=문서 파생물, 시간=레코드). 실시간으로 증명할 것은
    // "기록 뒤 방송이 온다"(즉시 1 + 갱신 후 1) + "API 가 done" 이다.
    await waitFor(() => servedAtBroadcast.length >= 2);
    const last = FeaturesResponse.parse(await (await app.request("/api/features/alpha")).json());
    expect(last.features[0]?.newTickets?.[0]?.status).toBe("done");
  });

  test("레거시 Time: 줄을 문서에 써도 화면은 바뀌지 않는다 — 읽히지 않는다", async () => {
    root = mkdtempSync(join(tmpdir(), "gootte-t05-rt2-"));
    dataDir = mkdtempSync(join(tmpdir(), "gootte-t05-rt2-db-"));
    const projRoot = makeProject(root, "alpha", "work", "# T04 — 티켓\n");
    const copies = [projRoot];

    const app = createApp({ roots: [root], treehouse: NO_TREEHOUSE, dataDir });
    recordProjectScan(dataDir, { slug: "alpha", path: projRoot, copies }, readFeatures(copies));
    const scheduler = createProjectUpdateScheduler({ dataDir, roots: () => [root], broadcast: () => {} });
    watchers = startWatchers({
      roots: [root],
      dataDir,
      onChange: (c) => {
        if (c.kind === "project") scheduler.schedule(c.project);
      },
    });
    await sleep(300);

    // 좀비 줄 — 옛 gootte 가 쓰던 자리. 읽히지 않으므로 pending 그대로여야 한다.
    writeFileSync(
      join(projRoot, "docs", "features", "work", "tickets", "T04.md"),
      "# T04 — 티켓\n\nTime: started=2026-08-29T10:00:00+09:00 finished=2026-08-29T11:00:00+09:00\n",
    );
    // 감시·갱신이 돌 시간이 흘러도(refresh 유무와 무관하게) pending 이다.
    await sleep(800);
    const body = FeaturesResponse.parse(await (await app.request("/api/features/alpha")).json());
    expect(body.features[0]?.newTickets?.[0]?.status).toBe("pending");
  });
});
