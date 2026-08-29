import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { FeaturesResponse, type Feature } from "@gootte/contract";
import { applyBacklogStatus } from "@gootte/core";
import { readFeatures } from "@gootte/core-io";
import { createApp } from "../src/app";
import { createLiveHub, type LiveSocket } from "../src/live";
import { clearDiscoverCache } from "../src/discover-cache";
import { startWatchers, type Watchers } from "../src/watchers";
import { createProjectUpdateScheduler, recordProjectScan, snapshotFeatures } from "../src/snapshot";

// 🔴 이 저장소 자신의 docs/ 를 픽스처로 쓰지 않는다(verify gate 규율).
// 실시간 갱신 공백(캡틴 실측 2026-08-29): `gootte end` 로 `Time:` 줄을 기록한 직후 화면이
// 수동 새로고침 없이 "완료" 로 바뀌는지 — 감시기 → 증분 갱신 스케줄러 → 스냅샷 갱신 → 같은
// `project` 이벤트 방송 → app 이 새 값을 서빙하는 전체 왕복을 잰다.

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

describe("realtime — 문서 변경(Time: 기록) → 증분 갱신 → 스냅샷 갱신 → 같은 project 이벤트 방송 (T05)", () => {
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

  test("gootte 로 Time: 를 기록하면 갱신 후 방송이 새 값(done)을 싣고, 화면이 즉시 반영된다", async () => {
    root = mkdtempSync(join(tmpdir(), "gootte-t05-rt-"));
    dataDir = mkdtempSync(join(tmpdir(), "gootte-t05-rt-db-"));
    const projRoot = makeProject(root, "alpha", "work", "# T04 — 티켓\n"); // 시작엔 Time: 없음
    const copies = [projRoot];

    const hub = createLiveHub();
    // 방송을 잡는다. 각 `project` alpha 방송 시점에 서빙될 스냅샷 상태를 동기로 찍는다 —
    // 즉시 방송은 아직 낡은 스냅샷(pending)을, 갱신 후 방송은 새 값(done)을 싣는지 본다.
    const servedAtBroadcast: string[] = [];
    // 스냅샷은 raw readFeatures 출력(status 는 applyBacklogStatus 가 Time: 에서 굴린다) — 캡처 시
    // 같은 변환을 거쳐 실제 서빙 상태를 본다(Time: → done 은 여기서 계산된다).
    const servedStatus = (): string => {
      const snap = snapshotFeatures(dataDir, "alpha", copies);
      if (!snap) return "none";
      return applyBacklogStatus(snap, [], "", "2026-08-30T00:00:00Z")[0]?.newTickets?.[0]?.status ?? "none";
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

    // 🔴 gootte end 동작 흉내 — T04 문서에 `Time:` 줄 기록(완료)
    writeFileSync(
      join(projRoot, "docs", "features", "work", "tickets", "T04.md"),
      "# T04 — 티켓\n\nTime: started=2026-08-29T10:00:00+09:00 finished=2026-08-29T11:00:00+09:00\n",
    );

    // 화면이 갱신될 때까지 대기(수동 새로고침 없이)
    await waitFor(async () => {
      const body = FeaturesResponse.parse(await (await app.request("/api/features/alpha")).json());
      return body.features[0]?.newTickets?.[0]?.status === "done";
    });

    // 방송이 실제로 나갔다(프론트가 invalidate 할 신호)
    expect(servedAtBroadcast.length).toBeGreaterThan(0);
    // 첫 즉시 방송은 아직 낡은 스냅샷(pending) — 갱신 후 방송이 done 을 실었다(실시간 공백 제거)
    expect(servedAtBroadcast).toContain("pending");
    expect(servedAtBroadcast[servedAtBroadcast.length - 1]).toBe("done");
  });

  test("여러 사본 중 2nd 에만 Time: 가 생겨도(정방향 병합) 화면이 done 으로 갱신된다", async () => {
    // 같은 basename 의 사본을 서로 다른 뿌리에 둬 하나의 프로젝트로 묶인다(discover 규칙).
    root = mkdtempSync(join(tmpdir(), "gootte-t05-rt2a-"));
    rootB = mkdtempSync(join(tmpdir(), "gootte-t05-rt2b-"));
    dataDir = mkdtempSync(join(tmpdir(), "gootte-t05-rt2-db-"));
    // main(대표 사본, copies[0]) 에는 Time: 없이, 2nd 에만 있는 상태로 시작
    const main = makeProject(root, "work-project", "work", "# T04 — 티켓\n");
    const second = makeProject(rootB, "work-project", "work", "# T04 — 티켓\n");
    const copies = [main, second];

    const hub = createLiveHub();
    const servedAtBroadcast: string[] = [];
    const servedStatus2 = (): string => {
      const snap = snapshotFeatures(dataDir, "work-project", copies);
      if (!snap) return "none";
      return applyBacklogStatus(snap, [], "", "2026-08-30T00:00:00Z")[0]?.newTickets?.[0]?.status ?? "none";
    };
    const client: LiveSocket = {
      send: (d) => {
        if (d.includes('"kind":"project"') && d.includes('"work-project"')) {
          servedAtBroadcast.push(servedStatus2());
        }
      },
    };
    hub.add(client);

    const app = createApp({ roots: [root, rootB], treehouse: NO_TREEHOUSE, dataDir });
    recordProjectScan(dataDir, { slug: "work-project", path: main, copies }, readFeatures(copies));

    const scheduler = createProjectUpdateScheduler({ dataDir, roots: () => [root, rootB], broadcast: hub.broadcast });
    watchers = startWatchers({
      roots: [root, rootB],
      dataDir,
      onChange: (c) => {
        if (c.kind === "project") scheduler.schedule(c.project);
        hub.broadcast(c);
      },
    });
    await sleep(300);

    // 2nd 에만 Time: 기록
    writeFileSync(
      join(second, "docs", "features", "work", "tickets", "T04.md"),
      "# T04 — 티켓\n\nTime: started=2026-08-29T10:00:00+09:00 finished=2026-08-29T11:00:00+09:00\n",
    );

    await waitFor(async () => {
      const body = FeaturesResponse.parse(await (await app.request("/api/features/work-project")).json());
      return body.features[0]?.newTickets?.[0]?.status === "done";
    });
    expect(servedAtBroadcast[servedAtBroadcast.length - 1]).toBe("done");
  });
});
